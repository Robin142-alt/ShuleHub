import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { SupportRepository } from './repositories/support.repository';

type ConsentSource = 'public_status_page';

export interface SupportStatusSubscribeInput {
  email: string;
  consentSource: ConsentSource;
  locale?: string;
  clientIp?: string | null;
  now?: string;
}

export interface SupportStatusUnsubscribeInput {
  token: string;
  now?: string;
}

export interface PublicStatusIncident {
  id: string;
  title: string;
  impact: string;
  status: string;
  component_id?: string | null;
  component_name?: string | null;
  started_at?: string | null;
  resolved_at?: string | null;
  update_summary?: string | null;
  updated_at?: string | null;
}

export interface PublicSystemStatusPayload {
  components: Array<Record<string, unknown>>;
  incidents: PublicStatusIncident[];
  active_incidents: PublicStatusIncident[];
  historical_incidents: PublicStatusIncident[];
  generated_at: string;
}

interface UnsubscribeTokenPayload {
  purpose: 'support-status.unsubscribe';
  contact_hash: string;
  expires_at: string;
  nonce: string;
}

@Injectable()
export class SupportStatusSubscriptionService {
  constructor(
    private readonly supportRepository: SupportRepository,
    private readonly configService?: ConfigService,
  ) {}

  async subscribe(input: SupportStatusSubscribeInput): Promise<{
    status: 'subscribed';
    unsubscribe_token: string;
  }> {
    const email = normalizeEmail(input.email);
    const now = normalizeTimestamp(input.now);
    const contactHash = hashContact(email, this.getSecret());
    const ipHash = input.clientIp ? hashContact(input.clientIp, this.getSecret()) : null;
    const recentAttempts =
      await this.supportRepository.countRecentStatusSubscriptionAttempts({
        contactHash,
        ipHash,
        since: new Date(new Date(now).getTime() - 15 * 60_000).toISOString(),
      });

    if (recentAttempts >= 3) {
      throw new HttpException('Too many status subscription attempts', HttpStatus.TOO_MANY_REQUESTS);
    }

    await this.supportRepository.createStatusSubscription({
      contact_hash: contactHash,
      consent_source: input.consentSource,
      consent_at: now,
      locale: input.locale?.trim() || null,
      client_ip_hash: ipHash,
    });

    const unsubscribeToken = createSignedToken({
      contact_hash: contactHash,
      expires_at: new Date(new Date(now).getTime() + 365 * 24 * 60 * 60_000).toISOString(),
      nonce: randomBytes(12).toString('base64url'),
    }, this.getSecret());

    await this.supportRepository.createStatusUnsubscribeToken({
      contact_hash: contactHash,
      token_hash: hashToken(unsubscribeToken),
      expires_at: decodeSignedToken(unsubscribeToken, this.getSecret()).expires_at,
    });

    return {
      status: 'subscribed',
      unsubscribe_token: unsubscribeToken,
    };
  }

  async unsubscribe(input: SupportStatusUnsubscribeInput): Promise<{ status: 'unsubscribed' }> {
    const payload = decodeSignedToken(input.token, this.getSecret());
    const now = input.now ? Date.parse(input.now) : Date.now();

    if (Number.isNaN(now) || Date.parse(payload.expires_at) <= now) {
      throw new BadRequestException('Status unsubscribe token has expired');
    }

    await this.supportRepository.unsubscribeStatusSubscriber(payload.contact_hash);
    await this.supportRepository.revokeStatusUnsubscribeToken(hashToken(input.token));

    return { status: 'unsubscribed' };
  }

  async queueIncidentNotifications(input: {
    incidentId: string;
    title: string;
    status: string;
    updateSummary: string;
    internalNotes?: string | null;
  }): Promise<{ queued: number }> {
    const subscribers = await this.supportRepository.listActiveStatusSubscribers();
    const publicBody = `${input.title}: ${input.updateSummary}`;

    for (const subscriber of subscribers) {
      await this.supportRepository.createStatusNotificationAttempt({
        subscription_id: subscriber.id,
        contact_hash: subscriber.contact_hash,
        incident_id: input.incidentId,
        channel: 'email',
        status: 'queued',
        payload: {
          title: input.title,
          incident_status: input.status,
          body: publicBody,
          locale: subscriber.locale ?? null,
        },
      });
    }

    return { queued: subscribers.length };
  }

  async updateComponentFromSloBreach(input: {
    componentSlug: string;
    status: 'degraded' | 'partial_outage' | 'major_outage';
    reason: string;
  }): Promise<void> {
    await this.supportRepository.updateStatusComponentFromSloBreach(input);
  }

  toPublicStatus(input: {
    components: Array<Record<string, unknown>>;
    incidents: Array<Record<string, unknown>>;
  }): PublicSystemStatusPayload {
    const incidents = (input.incidents ?? []).map((incident) => sanitizeIncident(incident));

    return {
      components: input.components ?? [],
      incidents,
      active_incidents: incidents.filter((incident) => incident.status !== 'resolved'),
      historical_incidents: incidents.filter((incident) => incident.status === 'resolved'),
      generated_at: new Date().toISOString(),
    };
  }

  private getSecret(): string {
    return (
      this.configService?.get<string>('support.statusSubscriptionSecret')
      ?? this.configService?.get<string>('SUPPORT_STATUS_SUBSCRIPTION_SECRET')
      ?? process.env.SUPPORT_STATUS_SUBSCRIPTION_SECRET
      ?? 'development-status-subscription-secret'
    );
  }
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new BadRequestException('A valid email is required for status subscriptions');
  }

  return normalized;
}

function normalizeTimestamp(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Status subscription timestamp must be valid');
  }

  return date.toISOString();
}

function hashContact(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value.trim().toLowerCase()).digest('hex');
}

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createSignedToken(
  input: Omit<UnsubscribeTokenPayload, 'purpose'>,
  secret: string,
): string {
  const payload: UnsubscribeTokenPayload = {
    purpose: 'support-status.unsubscribe',
    ...input,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  return `${encodedPayload}.${signature}`;
}

function decodeSignedToken(token: string, secret: string): UnsubscribeTokenPayload {
  const [encodedPayload, signature, extra] = token.split('.');

  if (!encodedPayload || !signature || extra !== undefined) {
    throw new BadRequestException('Status unsubscribe token is invalid');
  }

  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');

  if (!safeEqual(signature, expectedSignature)) {
    throw new BadRequestException('Status unsubscribe token is invalid');
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<UnsubscribeTokenPayload>;

  if (
    payload.purpose !== 'support-status.unsubscribe'
    || !payload.contact_hash
    || !/^[a-f0-9]{64}$/i.test(payload.contact_hash)
    || !payload.expires_at
    || Number.isNaN(Date.parse(payload.expires_at))
  ) {
    throw new BadRequestException('Status unsubscribe token is invalid');
  }

  return {
    purpose: 'support-status.unsubscribe',
    contact_hash: payload.contact_hash,
    expires_at: payload.expires_at,
    nonce: payload.nonce ?? '',
  };
}

function sanitizeIncident(incident: Record<string, unknown>): PublicStatusIncident {
  return {
    id: String(incident.id ?? ''),
    title: String(incident.title ?? ''),
    impact: String(incident.impact ?? 'minor'),
    status: String(incident.status ?? 'investigating'),
    component_id: readString(incident.component_id),
    component_name: readString(incident.component_name),
    started_at: readString(incident.started_at),
    resolved_at: readString(incident.resolved_at),
    update_summary: readString(incident.update_summary),
    updated_at: readString(incident.updated_at),
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
