import { BILLING_LINKS } from "@/config/billing";
import { formatUsd } from "@/lib/format";

export function LowBalanceBanner({ remainingUsd }: { remainingUsd: number }) {
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 md:px-8">
      Баланс ИИ на OpenRouter заканчивается: осталось {formatUsd(remainingUsd)}. Когда он кончится, разбор и сценарии остановятся.{" "}
      <a href={BILLING_LINKS.openrouter} target="_blank" rel="noopener noreferrer" className="font-medium underline">
        Пополнить
      </a>
    </div>
  );
}
