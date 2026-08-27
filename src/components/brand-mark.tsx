export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "brand-mark brand-mark--compact" : "brand-mark"} aria-label="ТЯМА">
      <span aria-hidden="true" className="brand-mark__base">ТЯМА</span>
      <span aria-hidden="true" className="brand-mark__plate brand-mark__plate--blue">ТЯМА</span>
      <span aria-hidden="true" className="brand-mark__plate brand-mark__plate--coral">ТЯМА</span>
    </span>
  );
}
