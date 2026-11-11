import { useFonts } from "expo-font";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  BackHandler,
  AppState,
  ActivityIndicator,
  Platform,
  Linking,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DesignProvider,
  useDesign,
  Button,
  Label,
  Notice,
  Screen,
} from "./src/ui";
import { Icon } from "./src/icons";
import { PlayerScreen } from "./src/screens/PlayerScreens";
import { OrganizerScreen } from "./src/screens/OrganizerScreens";
import { api, ApiError } from "./src/api/client";
import type { Route } from "./src/types";
const tabs = [
  { name: "games", ru: "Мои игры", en: "My games" },
  { name: "tournaments", ru: "Турниры", en: "Tournaments" },
  { name: "standings", ru: "Таблица", en: "Standings" },
  { name: "profile", ru: "Профиль", en: "Profile" },
];

export function Shell({ initialRoute }: { initialRoute?: Route } = {}) {
  const { colors, theme, wide, locale, applyLocale, t } = useDesign();
  const [stack, setStack] = useState<Route[]>([
    initialRoute || { name: "games" },
  ]);
  const [session, setSession] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [count, setCount] = useState(0);
  const { width: windowWidth } = useWindowDimensions();
  const sideNav = windowWidth >= 600;
  const route = stack[stack.length - 1];
  const refreshing = useRef(false);
  const userId = useRef<number | null>(null);
  const navigate = useCallback((name: string, params?: Record<string, any>) => {
    setStack((s) =>
      tabs.some((v) => v.name === name)
        ? [{ name, params }]
        : [...s, { name, params }],
    );
  }, []);
  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);
  const refreshSession = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const next = await api.me();
      if (userId.current !== null && next.user?.id !== userId.current)
        setStack([{ name: "games" }]);
      userId.current = next.user?.id ?? null;
      setSession(next);
      setError("");
      if (next.user) {
        api
          .notifications()
          .then((data) => setCount(data.unreadCount))
          .catch(() => {});
      } else setCount(0);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setSession({ user: null });
        setCount(0);
        setStack([{ name: "login" }]);
        userId.current = null;
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }, []);
  useEffect(() => {
    void refreshSession();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshSession();
    });
    return () => listener.remove();
  }, [refreshSession]);
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [stack.length, back]);
  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    AsyncStorage.getItem("kt.locale")
      .then((explicit) => {
        if (explicit) return;
        return api.telegramStatus().then((status) => {
          const bot = (status.link as any)?.locale;
          if (active && (bot === "ru" || bot === "en")) applyLocale(bot);
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.user?.id]);
  // Only allow recognized Companion routes; external URLs never become API destinations.
  useEffect(() => {
    const open = (url: string) => {
      try {
        const u = new URL(url);
        if (!["ktcompanion:", "https:"].includes(u.protocol)) return;
        if (
          u.protocol === "https:" &&
          !["ktcompanion.ru", "killteamcompanion.com"].includes(u.hostname)
        )
          return;
        const path =
          u.protocol === "ktcompanion:"
            ? "/" + u.host + u.pathname
            : u.pathname;
        const game = path.match(/^\/games\/([1-9]\d*)$/),
          event = path.match(/^\/tournaments\/([^/]+)$/);
        if (game) navigate("game", { id: Number(game[1]) });
        else if (event)
          navigate("tournament", { slug: decodeURIComponent(event[1]) });
      } catch {}
    };
    Linking.getInitialURL().then((url) => {
      if (url) open(url);
    });
    const sub = Linking.addEventListener("url", (event) => open(event.url));
    return () => sub.remove();
  }, [navigate]);
  const active = ["game", "score", "review", "complete"].includes(route.name)
    ? "games"
    : [
          "tournament",
          "registration",
          "participants",
          "schedule",
          "team",
          "pairing",
          "table",
          "roster-registration",
        ].includes(route.name)
      ? "tournaments"
      : ["settings", "account", "notifications"].includes(route.name) ||
          route.name.startsWith("org")
        ? "profile"
        : route.name;
  const nav = (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: sideNav ? "column" : "row",
        gap: 4,
        padding: 8,
        borderColor: colors.line,
        borderTopWidth: sideNav ? 0 : 1,
        borderRightWidth: sideNav ? 1 : 0,
        backgroundColor: colors.surface,
        ...(sideNav ? { width: 188 } : {}),
      }}
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.name}
          accessibilityRole="tab"
          accessibilityLabel={t(tab.ru, tab.en)}
          accessibilityState={{ selected: active === tab.name }}
          onPress={() => navigate(tab.name)}
          style={({ pressed }) => ({
            flex: sideNav ? undefined : 1,
            minWidth: 0,
            minHeight: 60,
            paddingHorizontal: 6,
            paddingVertical: 8,
            flexDirection: sideNav ? "row" : "column",
            gap: 8,
            alignItems: "center",
            justifyContent: sideNav ? "flex-start" : "center",
            borderRadius: 7,
            backgroundColor:
              active === tab.name
                ? colors.accent
                : pressed
                  ? colors.panel3
                  : "transparent",
          })}
        >
          <Icon
            name={tab.name}
            color={active === tab.name ? colors.onAccent : colors.muted}
          />
          <Text
            style={{
              fontSize: sideNav ? 14 : 11,
              fontFamily: "CompanionInter650",
              textAlign: "center",
              flexShrink: 1,
              color: active === tab.name ? colors.onAccent : colors.muted,
            }}
          >
            {t(tab.ru, tab.en)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  const iconButton = (
    name: string,
    label: string,
    press: () => void,
    badge = 0,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={press}
      style={({ pressed }) => ({
        minWidth: 48,
        minHeight: 48,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: colors.lineStrong,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.panel3 : colors.panel2,
      })}
    >
      <Icon name={name} color={colors.ink} />
      {badge > 0 && (
        <View
          style={{
            position: "absolute",
            top: -5,
            right: -5,
            minWidth: 20,
            minHeight: 20,
            paddingHorizontal: 4,
            borderRadius: 99,
            borderWidth: 2,
            borderColor: colors.surface,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{ fontSize: 10, fontWeight: "800", color: colors.onAccent }}
          >
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bg }}
      edges={["top", "bottom", "left", "right"]}
    >
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 8,
          gap: 12,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderColor: colors.line,
        }}
      >
        {stack.length > 1 && iconButton("back", t("Назад", "Back"), back)}
        <Image
          accessibilityLabel="KT Companion"
          source={
            theme === "dark"
              ? require("./assets/mark-dark.png")
              : require("./assets/mark-light.png")
          }
          style={{ width: 38, height: 38, resizeMode: "contain" }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontWeight: "800", fontSize: 14, color: colors.ink }}>
            KT COMPANION
          </Text>
          <Text
            style={{
              fontFamily: "CompanionInter650",
              fontSize: 10,
              color: colors.accentText,
            }}
          >
            {t("ТУРНИРНАЯ СИСТЕМА", "TOURNAMENT SYSTEM")}
          </Text>
        </View>
        {iconButton(
          "bell",
          t(`Уведомления: ${count}`, `Notifications: ${count}`),
          () => navigate("notifications"),
          count,
        )}
      </View>
      <View style={{ flex: 1, flexDirection: "row", minHeight: 0 }}>
        {sideNav && nav}
        <View style={{ flex: 1, minWidth: 0 }}>
          {error && (
            <Notice error>
              <Label>
                {t(
                  "Нет соединения. Данные могут быть устаревшими.",
                  "No connection. Data may be outdated.",
                )}
              </Label>
              <Button
                title={t("Повторить", "Retry")}
                onPress={() => void refreshSession()}
              />
            </Notice>
          )}
          {loading ? (
            <Screen>
              <ActivityIndicator color={colors.accent} />
              <Label>{t("Загрузка аккаунта…", "Loading account…")}</Label>
            </Screen>
          ) : route.name.startsWith("org") ? (
            <OrganizerScreen
              key={JSON.stringify(route)}
              route={route}
              navigate={navigate}
              session={session}
              refreshSession={refreshSession}
            />
          ) : (
            <PlayerScreen
              key={JSON.stringify(route)}
              route={route}
              navigate={navigate}
              session={session}
              refreshSession={refreshSession}
            />
          )}
        </View>
      </View>
      {!sideNav && nav}
    </SafeAreaView>
  );
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            backgroundColor: "#050505",
          }}
        >
          <Text style={{ color: "#f4f4f4" }}>
            Не удалось открыть экран / Unable to open screen
          </Text>
          <Pressable
            onPress={() => this.setState({ failed: false })}
            style={{ padding: 16 }}
          >
            <Text style={{ color: "#ff7a1a" }}>Повторить / Retry</Text>
          </Pressable>
        </View>
      );
    return this.props.children;
  }
}
export default function App() {
  const [fonts, error] = useFonts({
    CompanionInter400: require("./assets/fonts/CompanionInter400.ttf"),
    CompanionInter650: require("./assets/fonts/CompanionInter650.ttf"),
    CompanionInter800: require("./assets/fonts/CompanionInter800.ttf"),
  });
  if (!fonts && !error) return <ActivityIndicator />;
  return (
    <SafeAreaProvider>
      <DesignProvider>
        <ErrorBoundary>
          <Shell />
        </ErrorBoundary>
      </DesignProvider>
    </SafeAreaProvider>
  );
}
