import React, { useState } from "react";
import { Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { api, assetUrl } from "../api/client";
import { Card, Button, Heading, Label, useDesign } from "../ui";
import { ConfirmAction, ErrorNotice } from "./player-shared";

export function AttachmentEditor({
  tournament,
  onSaved,
}: {
  tournament: Record<string, any>;
  onSaved: () => Promise<void>;
}) {
  const { t } = useDesign();
  const [logo, setLogo] = useState<string | null | undefined>(),
    [pdf, setPdf] = useState<string | undefined>(),
    [pdfName, setPdfName] = useState(""),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  async function chooseLogo() {
    setError(null);
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });
      if (result.canceled) return;
      const item = result.assets[0],
        base64 = item.base64;
      if (!base64)
        throw new Error(
          t("Не удалось прочитать изображение", "Unable to read image"),
        );
      const bytes =
        Math.floor((base64.length * 3) / 4) -
        (base64.match(/=*$/)?.[0].length || 0);
      if (bytes > 1024 * 1024)
        throw new Error(
          t(
            "Изображение должно быть не больше 1 МБ",
            "Image must be at most 1 MB",
          ),
        );
      const mime = base64.startsWith("/9j/")
        ? "image/jpeg"
        : base64.startsWith("iVBORw0KGgo")
          ? "image/png"
          : base64.startsWith("R0lGOD")
            ? "image/gif"
            : item.mimeType === "image/webp"
              ? "image/webp"
              : null;
      if (!mime)
        throw new Error(
          t(
            "Выберите PNG, JPEG, GIF или WebP",
            "Choose PNG, JPEG, GIF or WebP",
          ),
        );
      setLogo(`data:${mime};base64,${base64}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function choosePdf() {
    setError(null);
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const item = result.assets[0];
      if (item.size && item.size > 2_000_000)
        throw new Error(
          t("PDF должен быть не больше 2 МБ", "PDF must be at most 2 MB"),
        );
      const file = new File(item.uri);
      if (file.size > 2_000_000)
        throw new Error(
          t("PDF должен быть не больше 2 МБ", "PDF must be at most 2 MB"),
        );
      const base64 = await file.base64();
      if (!base64.startsWith("JVBERi0"))
        throw new Error(
          t("Файл не является PDF", "The selected file is not a PDF"),
        );
      if (base64.length + 29 > 2_800_000)
        throw new Error(t("PDF слишком большой", "PDF is too large"));
      setPdf(`data:application/pdf;base64,${base64}`);
      setPdfName(item.name);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const preview =
    logo === undefined ? assetUrl(tournament.logoData) : logo || undefined;
  return (
    <Card>
      <Heading>{t("Логотип и файл правил", "Logo and rules file")}</Heading>
      <Label muted>
        {t(
          "Логотип: до 1 МБ. PDF правил: до 2 МБ. Файлы загрузятся только после подтверждения.",
          "Logo: up to 1 MB. Rules PDF: up to 2 MB. Files upload only after confirmation.",
        )}
      </Label>
      {preview && (
        <Image
          source={{ uri: preview }}
          accessibilityLabel={t("Логотип турнира", "Tournament logo")}
          style={{ width: 96, height: 96, borderRadius: 7 }}
          resizeMode="contain"
        />
      )}
      <Button
        title={t("Выбрать логотип", "Choose logo")}
        disabled={busy}
        onPress={() => void chooseLogo()}
      />
      {preview && (
        <Button
          title={t("Убрать логотип", "Remove logo")}
          variant="secondary"
          disabled={busy}
          onPress={() => setLogo(null)}
        />
      )}
      <Button
        title={t("Выбрать PDF правил", "Choose rules PDF")}
        disabled={busy}
        onPress={() => void choosePdf()}
      />
      {pdfName && <Label>{pdfName}</Label>}
      <ErrorNotice error={error} />
      <ConfirmAction
        title={t("Сохранить файлы", "Save attachments")}
        disabled={
          busy ||
          (logo === undefined && pdf === undefined) ||
          !tournament.updatedAt
        }
        description={t(
          "Заменить выбранные файлы турнира?",
          "Replace the selected tournament files?",
        )}
        onConfirm={async () => {
          await api.updateTournament(tournament.id, {
            expectedUpdatedAt: tournament.updatedAt,
            ...(logo !== undefined ? { logoData: logo } : {}),
            ...(pdf !== undefined ? { rulesLink: pdf } : {}),
          });
          setLogo(undefined);
          setPdf(undefined);
          setPdfName("");
          await onSaved();
        }}
      />
    </Card>
  );
}
