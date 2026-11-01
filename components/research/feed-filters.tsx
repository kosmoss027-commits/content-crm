"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ANY = "any";

type Option = { value: string; label: string };

function FilterSelect({ name, label, options }: { name: string; label: string; options: Option[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const change = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === ANY) next.delete(name);
    else next.set(name, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <Select value={params.get(name) ?? ANY} onValueChange={change}>
      <SelectTrigger className="h-8 w-auto min-w-32" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}: все</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FeedFilters({ niches }: { niches: string[] }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <FilterSelect
        name="market"
        label="Рынок"
        options={[
          { value: "CIS", label: "СНГ" },
          { value: "FOREIGN", label: "Зарубеж" },
        ]}
      />
      {niches.length > 0 && (
        <FilterSelect name="niche" label="Ниша" options={niches.map((n) => ({ value: n, label: n }))} />
      )}
      <FilterSelect
        name="period"
        label="Период"
        options={[
          { value: "3", label: "3 дня" },
          { value: "7", label: "7 дней" },
          { value: "30", label: "30 дней" },
          { value: "90", label: "90 дней" },
        ]}
      />
      <FilterSelect
        name="min"
        label="Множитель"
        options={[
          { value: "5", label: "от ×5" },
          { value: "10", label: "от ×10" },
          { value: "20", label: "от ×20" },
        ]}
      />
      <FilterSelect
        name="duration"
        label="Длительность"
        options={[
          { value: "15", label: "до 15 с" },
          { value: "30", label: "до 30 с" },
          { value: "60", label: "до 1 мин" },
        ]}
      />
    </div>
  );
}
