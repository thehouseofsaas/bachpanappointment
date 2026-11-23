/** Developer credit shown at the foot of every page frame. Hidden when printing. */
export function DeveloperCredit({ className = "" }: { className?: string }) {
  return (
    <p className={`no-print text-center text-xs text-muted ${className}`}>
      Developed by{" "}
      <a
        href="https://www.thehouseofsaas.com"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-muted underline-offset-4 hover:text-navy"
      >
        The House Of SaaS Pvt. Ltd.
      </a>
    </p>
  );
}
