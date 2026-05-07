export function formatCurrency(value: number, masked = false) {
  if (masked) {
    return "KES ••••••";
  }

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function maskValue(value: string, shouldMask: boolean) {
  return shouldMask ? value.replace(/[0-9]/g, "•") : value;
}
