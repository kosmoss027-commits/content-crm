import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children && <CardContent className="grid gap-4">{children}</CardContent>}
      {footer && <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">{footer}</CardFooter>}
    </Card>
  );
}

export function NotConfiguredNotice() {
  return (
    <AuthCard
      title="Вход не настроен"
      description="Заполните ключи Supabase в .env (см. .env.example) или включите DEV_AUTH=1 для локальной разработки."
    />
  );
}
