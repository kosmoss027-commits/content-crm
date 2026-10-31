import { LockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Section } from "@/lib/navigation";
import { SectionIcon } from "@/components/layout/section-icon";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function SectionPlaceholder({ section }: { section: Section }) {
  return (
    <>
      <PageHeader title={section.title} description={section.description} />
      <div className="grid place-items-center rounded-xl border border-dashed px-6 py-16 text-center">
        <SectionIcon name={section.icon} className="mb-4 size-8 text-muted-foreground" />
        <Badge variant="secondary" className="mb-2">
          Этап {section.stage}
        </Badge>
        <p className="max-w-sm text-sm text-muted-foreground">
          Раздел появится на этапе {section.stage}. Сейчас здесь пусто, но меню, проекты и доступы уже работают.
        </p>
      </div>
    </>
  );
}

export function NoAccess() {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <LockIcon className="mb-4 size-8 text-muted-foreground" />
      <p className="font-medium">Нет доступа</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        У вашей роли нет доступа к этому разделу. Если он нужен, попросите владельца пространства сменить роль.
      </p>
    </div>
  );
}
