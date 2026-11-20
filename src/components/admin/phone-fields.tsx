import { adminInput, adminLabel } from "@/components/admin/frame";
import { formatPhone } from "@/domain/phone";

const LABELS = ["Father", "Mother", "Guardian"];

/**
 * Phone inputs for one child: fields named phone1..N with label1..N.
 * Leave a row empty to remove that number.
 */
export function PhoneFields({
  idPrefix,
  rows,
  phones = [],
}: {
  idPrefix: string;
  rows: number;
  phones?: Array<{ phone: string; label: string | null }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: rows }, (_, i) => {
        const p = phones[i];
        const n = i + 1;
        const options = p?.label && !LABELS.includes(p.label) ? [...LABELS, p.label] : LABELS;
        return (
          <div key={n}>
            <label htmlFor={`${idPrefix}-phone${n}`} className={adminLabel}>
              Parent phone {n}
            </label>
            <div className="flex gap-2">
              <input
                id={`${idPrefix}-phone${n}`}
                name={`phone${n}`}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={30}
                defaultValue={p ? formatPhone(p.phone) : ""}
                placeholder="10-digit mobile"
                className={`${adminInput} min-w-0 flex-1`}
              />
              <select
                name={`label${n}`}
                aria-label={`Whose number is phone ${n}`}
                defaultValue={p?.label ?? ""}
                className={`${adminInput} w-auto! shrink-0`}
              >
                <option value="">Parent</option>
                {options.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}
