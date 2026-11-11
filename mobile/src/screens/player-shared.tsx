import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  View,
  Modal,
  Pressable,
  ScrollView,
  AppState,
} from "react-native";
import { Card, Button, Label, Heading, TextField, useDesign } from "../ui";

export function useResource<T = any>(
  load: () => Promise<T>,
  key: string,
  autoRefresh = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(async () => {
    const n = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadRef.current();
      if (n === generation.current) setData(next);
    } catch (e) {
      if (n === generation.current) setError(e);
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }, [key]);
  useEffect(() => {
    setData(null);
    void reload();
    return () => {
      generation.current++;
    };
  }, [reload]);
  useEffect(() => {
    if (!autoRefresh) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void reload();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void reload();
    }, 45000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [autoRefresh, reload]);
  return { data, error, loading, reload, setData };
}

export function ErrorNotice({ error }: { error: any }) {
  const { t } = useDesign();
  if (!error) return null;
  const status = error.status;
  const message = error.writeOutcomeUnknown
    ? t(
        "Ответ сервера не получен. Изменение могло сохраниться. Вернитесь к списку и заново откройте запись, чтобы проверить состояние перед повтором.",
        "No server response was received. The change may have been saved. Return to the list and reopen the record to check its state before retrying.",
      )
    : status === 401
      ? t(
          "Сессия закончилась. Войдите снова.",
          "Your session has expired. Sign in again.",
        )
      : status === 403
        ? t(
            "Нет доступа к этому действию.",
            "You do not have permission for this action.",
          )
        : status === 409
          ? t(
              "Данные изменились. Обновите экран и проверьте изменения перед повтором.",
              "The data has changed. Refresh and review it before trying again.",
            )
          : status === 429
            ? t(
                "Слишком много запросов. Подождите и повторите.",
                "Too many requests. Wait and try again.",
              )
            : status >= 500
              ? t(
                  "Сервис временно недоступен. Попробуйте позже.",
                  "The service is temporarily unavailable. Try again later.",
                )
              : error.message ||
                t(
                  "Не удалось выполнить запрос.",
                  "The request could not be completed.",
                );
  return (
    <Card>
      <Label>{message}</Label>
    </Card>
  );
}

export function ResourceState({
  resource,
  empty,
}: {
  resource: any;
  empty?: boolean;
}) {
  const { t, colors } = useDesign();
  if (resource.loading && !resource.data)
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t("Загрузка", "Loading")}
        style={{ padding: 32 }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  if (resource.error)
    return (
      <>
        <ErrorNotice error={resource.error} />
        <Button title={t("Повторить", "Retry")} onPress={resource.reload} />
      </>
    );
  if (empty)
    return (
      <Card>
        <Heading>{t("Пока ничего нет", "Nothing here yet")}</Heading>
        <Label muted>
          {t(
            "Данные появятся после регистрации или публикации организатором.",
            "Data will appear after registration or publication by the organizer.",
          )}
        </Label>
      </Card>
    );
  return null;
}

export function Choice({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<string | { value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t, colors } = useDesign();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const items = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <View style={{ gap: 6 }}>
      <Label muted>{label}</Label>
      <Button
        variant="secondary"
        disabled={disabled}
        title={
          items.find((i) => i.value === value)?.label || t("Выбрать", "Choose")
        }
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
      />
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#0009",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: colors.panel,
              borderColor: colors.line,
              borderWidth: 1,
              borderRadius: 7,
              padding: 20,
              gap: 12,
              width: "100%",
              maxWidth: 520,
              maxHeight: "85%",
            }}
          >
            <Heading>{label}</Heading>
            {items.length > 8 && (
              <TextField
                label={t("Поиск", "Search")}
                value={query}
                onChangeText={setQuery}
              />
            )}
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ gap: 8 }}>
                {items
                  .filter((i) =>
                    i.label.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((i) => (
                    <Button
                      key={i.value}
                      title={(i.value === value ? "✓ " : "") + i.label}
                      variant={i.value === value ? "primary" : "secondary"}
                      onPress={() => {
                        onChange(i.value);
                        setOpen(false);
                      }}
                    />
                  ))}
              </View>
            </ScrollView>
            <Button
              title={t("Закрыть", "Close")}
              variant="secondary"
              onPress={() => setOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function ConfirmAction({
  title,
  description,
  onConfirm,
  variant = "primary",
  disabled = false,
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const { t } = useDesign();
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const lock = useRef(false);
  async function run() {
    if (lock.current || (error as any)?.writeOutcomeUnknown) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setConfirm(false);
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <ErrorNotice error={error} />
      {confirm ? (
        <Card>
          <Label>{description}</Label>
          <Button
            title={
              busy ? t("Сохранение…", "Saving…") : t("Подтвердить", "Confirm")
            }
            variant={variant}
            disabled={busy || Boolean((error as any)?.writeOutcomeUnknown)}
            onPress={run}
          />
          <Button
            title={t("Отмена", "Cancel")}
            variant="secondary"
            disabled={busy}
            onPress={() => setConfirm(false)}
          />
        </Card>
      ) : (
        <Button
          title={title}
          variant={variant}
          disabled={disabled || Boolean((error as any)?.writeOutcomeUnknown)}
          onPress={() => setConfirm(true)}
        />
      )}
    </View>
  );
}

export function statusLabel(
  status: string,
  t: (ru: string, en: string) => string,
) {
  const labels: Record<string, [string, string]> = {
    open: ["Ожидает результата", "Awaiting result"],
    draft: ["Черновик", "Draft"],
    registration_open: ["Регистрация открыта", "Registration open"],
    registration_closed: ["Регистрация закрыта", "Registration closed"],
    in_progress: ["Идёт", "In progress"],
    pending_confirmation: ["На подтверждении", "Awaiting confirmation"],
    completed: ["Завершён", "Completed"],
    cancelled: ["Отменён", "Cancelled"],
    registered: ["Зарегистрирован", "Registered"],
    active: ["Активен", "Active"],
    incomplete: ["Состав не заполнен", "Incomplete roster"],
    finished: ["Завершён", "Finished"],
    removed: ["Удалён", "Removed"],
    archived: ["В архиве", "Archived"],
    joined: ["Участвует", "Joined"],
    pending_placement: ["Ожидает распределения", "Awaiting placement"],
    eliminated: ["Выбыл", "Eliminated"],
    not_ready: ["Не готов", "Not ready"],
    withdrawn: ["Заявка отозвана", "Withdrawn"],
    awaiting_roll: ["Инициатива", "Initiative"],
    mission_ban: ["Бан миссий", "Mission bans"],
    shield_selection: ["Выбор щита", "Choose Shield"],
    sword_selection: ["Выбор меча", "Choose Sword"],
    environment_selection: ["Выбор стола и миссии", "Choose table and mission"],
  };
  return labels[status] ? t(...labels[status]) : status || "—";
}
export function dateLabel(value: any, locale: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(locale === "en" ? "en-GB" : "ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}
