import React, { useState } from "react";
import { Image, View, ScrollView, Linking } from "react-native";
import { api, assetUrl, API_ORIGIN } from "../api/client";
import type { ScreenProps } from "../types";
import {
  Screen,
  Card,
  Button,
  TextField,
  Row,
  Grid,
  Label,
  Heading,
  Badge,
  Avatar,
  useDesign,
} from "../ui";
import { Choice, ResourceState, useResource, dateLabel } from "./player-shared";

export const communityRoutes = [
  "rankings",
  "statistics",
  "achievements",
  "achievement",
  "documentation",
  "player",
  "roster",
  "history",
];

export function CommunityScreen(props: ScreenProps) {
  switch (props.route.name) {
    case "rankings":
      return <Rankings {...props} />;
    case "statistics":
    case "history":
      return <Statistics {...props} />;
    case "achievements":
    case "achievement":
      return <Achievements {...props} />;
    case "documentation":
      return <Documentation {...props} />;
    case "player":
      return <PublicPlayer {...props} />;
    case "roster":
      return <PublicRoster {...props} />;
    default:
      return <Rankings {...props} />;
  }
}

function Pages({
  page,
  pagination,
  onChange,
}: {
  page: number;
  pagination: any;
  onChange: (page: number) => void;
}) {
  const { t } = useDesign();
  return (
    <Row>
      {page > 1 && (
        <Button
          title={t("Предыдущая", "Previous")}
          variant="secondary"
          onPress={() => onChange(page - 1)}
        />
      )}
      <Label>
        {page} / {pagination?.totalPages || 1}
      </Label>
      {page < (pagination?.totalPages || 1) && (
        <Button
          title={t("Следующая", "Next")}
          variant="secondary"
          onPress={() => onChange(page + 1)}
        />
      )}
    </Row>
  );
}

function Rankings({ navigate }: ScreenProps) {
  const { t } = useDesign();
  const [venue, setVenue] = useState("combined"),
    [kind, setKind] = useState("players"),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const resource = useResource<any>(
    () =>
      api.request(
        `${kind === "players" ? "/api/users" : "/api/leaderboards/teams"}?venue=${venue}&q=${encodeURIComponent(search)}&page=${page}&limit=20`,
      ),
    `${venue}:${kind}:${search}:${page}`,
  );
  const entries = resource.data?.users || resource.data?.teams || [];
  return (
    <Screen title={t("Рейтинг", "Rankings")}>
      <Row>
        <Button
          title={t("Игроки", "Players")}
          variant={kind === "players" ? "primary" : "secondary"}
          onPress={() => {
            setKind("players");
            setPage(1);
          }}
        />
        <Button
          title={t("Команды", "Teams")}
          variant={kind === "teams" ? "primary" : "secondary"}
          onPress={() => {
            setKind("teams");
            setPage(1);
          }}
        />
      </Row>
      <Choice
        label={t("Формат игры", "Venue")}
        value={venue}
        options={[
          { value: "combined", label: t("Общий рейтинг", "Combined") },
          "irl",
          "tts",
        ]}
        onChange={(v) => {
          setVenue(v);
          setPage(1);
        }}
      />
      <TextField
        label={t("Имя", "Name")}
        value={query}
        onChangeText={setQuery}
      />
      <Button
        title={t("Найти", "Search")}
        variant="secondary"
        onPress={() => {
          setSearch(query.trim());
          setPage(1);
        }}
      />
      <ResourceState
        resource={resource}
        empty={!resource.loading && !entries.length}
      />
      <Grid>
        {entries.map((p: any, i: number) => (
          <Card key={p.id}>
            <Row>
              <Label size={24}>
                {String(p.rank ?? (page - 1) * 20 + i + 1)}
              </Label>
              <Avatar name={p.name} uri={assetUrl(p.avatarUrl || p.logoUrl)} />
              <Heading>{p.name}</Heading>
            </Row>
            {(p.ratings?.[venue] ?? p.rating) != null && (
              <Badge>MMR {p.ratings?.[venue] ?? p.rating}</Badge>
            )}
            <Button
              title={t("Профиль", "Profile")}
              variant="secondary"
              onPress={() =>
                navigate(
                  kind === "players" ? "player" : "team",
                  kind === "players" ? { id: p.id } : { slug: p.slug },
                )
              }
            />
          </Card>
        ))}
      </Grid>
      <Pages
        page={page}
        pagination={resource.data?.pagination}
        onChange={setPage}
      />
    </Screen>
  );
}

function Statistics({ route, navigate }: ScreenProps) {
  const { t } = useDesign();
  const [venue, setVenue] = useState("combined"),
    [tab, setTab] = useState("faction"),
    [page, setPage] = useState(1);
  const history = route.name === "history";
  const resource = useResource<any>(
    () =>
      api.games(
        history
          ? { page, venue: venue === "combined" ? undefined : venue }
          : venue === "combined"
            ? {}
            : { venue },
      ),
    `${history}:${venue}:${page}`,
  );
  const games = (resource.data?.games || []).filter((g: any) =>
    ["tournament_match", "team_match_game"].includes(g.sourceType),
  );
  const map = new Map<
    string,
    { name: string; played: number; wins: number; draws: number; vp: number }
  >();
  for (const game of games) {
    for (const [key, score] of Object.entries(game.result?.scores || {}) as [
      string,
      any,
    ][]) {
      const name = score[tab === "faction" ? "faction" : "tacOp"];
      if (!name) continue;
      const row = map.get(name) || {
        name,
        played: 0,
        wins: 0,
        draws: 0,
        vp: 0,
      };
      row.played++;
      row.vp += Number(score.total || 0);
      if (game.result.winnerId == Number(key)) row.wins++;
      else if (game.result.winnerId == null) row.draws++;
      map.set(name, row);
    }
  }
  const rows = [...map.values()].sort(
    (a, b) => b.wins / b.played - a.wins / a.played || b.played - a.played,
  );
  return (
    <Screen
      title={
        history
          ? t("История турнирных игр", "Tournament game history")
          : t("Статистика турниров", "Tournament statistics")
      }
    >
      <Choice
        label={t("Формат игры", "Venue")}
        value={venue}
        options={[{ value: "combined", label: t("Все", "All") }, "irl", "tts"]}
        onChange={(v) => {
          setVenue(v);
          setPage(1);
        }}
      />
      <ResourceState
        resource={resource}
        empty={!resource.loading && !games.length}
      />
      {!history && (
        <>
          <Label muted>
            {t(
              "Только завершённые турнирные игры. Доля побед считается от всех игр, включая ничьи.",
              "Completed tournament games only. Win rate is wins divided by all games, including draws.",
            )}{" "}
            {games.length} {t("игр", "games")}.
          </Label>
          <Row>
            <Button
              title={t("Фракции", "Factions")}
              variant={tab === "faction" ? "primary" : "secondary"}
              onPress={() => setTab("faction")}
            />
            <Button
              title="Tac Ops"
              variant={tab === "tac" ? "primary" : "secondary"}
              onPress={() => setTab("tac")}
            />
          </Row>
          <Grid>
            {rows.map((row) => (
              <Card key={row.name}>
                <Heading>{row.name}</Heading>
                <Badge>{Math.round((row.wins / row.played) * 100)}%</Badge>
                <Label>
                  {t("Игр", "Games")}: {row.played} · {t("Побед", "Wins")}:{" "}
                  {row.wins} · {t("Ничьих", "Draws")}: {row.draws}
                </Label>
                <Label>
                  {t("Средний VP", "Average VP")}:{" "}
                  {(row.vp / row.played).toFixed(1)}
                </Label>
              </Card>
            ))}
          </Grid>
        </>
      )}
      {history && (
        <>
          <Grid>
            {games.map((g: any) => (
              <Card key={g.id}>
                <Heading>{g.tournament?.name}</Heading>
                <Label>{g.players.map((p: any) => p.name).join(" — ")}</Label>
                <Label>
                  {g.players
                    .map((p: any) => g.result?.scores?.[p.id]?.total ?? "—")
                    .join(" : ")}
                </Label>
                <Button
                  title={t("Открыть игру", "Open game")}
                  onPress={() => navigate("game", { id: g.id })}
                />
              </Card>
            ))}
          </Grid>
          <Pages
            page={page}
            pagination={resource.data?.pagination}
            onChange={setPage}
          />
        </>
      )}
    </Screen>
  );
}

function Achievements({ route, navigate }: ScreenProps) {
  const { t } = useDesign();
  const [page, setPage] = useState(1),
    [category, setCategory] = useState("achievement");
  const id = route.params?.id;
  const resource = useResource<any>(
    () =>
      api.request(
        `/api/achievements${id ? "/" + encodeURIComponent(id) : `?page=${page}&category=${category}`}`,
      ),
    `${id}:${page}:${category}`,
  );
  const entries = id
    ? resource.data?.achievement
      ? [resource.data.achievement]
      : []
    : resource.data?.achievements || [];
  return (
    <Screen title={t("Награды и титулы", "Awards and titles")}>
      {!id && (
        <Choice
          label={t("Категория", "Category")}
          value={category}
          options={[
            { value: "achievement", label: t("Награды", "Awards") },
            { value: "title", label: t("Титулы", "Titles") },
          ]}
          onChange={(v) => {
            setCategory(v);
            setPage(1);
          }}
        />
      )}
      <ResourceState
        resource={resource}
        empty={!resource.loading && !entries.length}
      />
      <Grid>
        {entries.map((item: any) => (
          <Card key={item.id}>
            {item.imageUrl ? (
              <Image
                source={{ uri: assetUrl(item.imageUrl) }}
                accessibilityLabel={item.name}
                style={{ width: 80, height: 80 }}
                resizeMode="contain"
              />
            ) : (
              <Label size={40}>{item.emoji || "🏅"}</Label>
            )}
            <Heading>{item.name}</Heading>
            <Label>{item.description}</Label>
            {!id && (
              <Button
                title={t("Обладатели", "Recipients")}
                variant="secondary"
                onPress={() => navigate("achievement", { id: item.id })}
              />
            )}
          </Card>
        ))}
      </Grid>
      {id ? (
        (resource.data?.recipients || []).map((r: any) => (
          <Card key={r.id}>
            <Heading>{r.name}</Heading>
            <Button
              title={t("Профиль", "Profile")}
              variant="secondary"
              onPress={() =>
                navigate(
                  r.userId ? "player" : "team",
                  r.userId ? { id: r.userId } : { slug: r.slug },
                )
              }
            />
          </Card>
        ))
      ) : (
        <Pages
          page={page}
          pagination={resource.data?.pagination}
          onChange={setPage}
        />
      )}
    </Screen>
  );
}

function Documentation({ route, navigate }: ScreenProps) {
  const { t, locale } = useDesign();
  const id = route.params?.id;
  const resource = useResource<any>(
    () =>
      api.request(
        `/api/documentation/${locale}${id ? "/" + encodeURIComponent(id) : ""}`,
      ),
    `${locale}:${id}`,
  );
  return (
    <Screen
      title={resource.data?.page?.title || t("Документация", "Documentation")}
    >
      <ResourceState resource={resource} />
      {id && resource.data?.page ? (
        <Card>
          <MarkdownText source={resource.data.page.markdown} />
        </Card>
      ) : (
        (resource.data?.pages || []).map((page: any) => (
          <Card key={page.id}>
            <Heading>{page.title}</Heading>
            <Label>{page.summary}</Label>
            <Button
              title={t("Читать", "Read")}
              onPress={() => navigate("documentation", { id: page.id })}
            />
          </Card>
        ))
      )}
    </Screen>
  );
}

function MarkdownText({ source }: { source: string }) {
  const clean = (s: string) =>
    s
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
  return (
    <View style={{ gap: 12 }}>
      {String(source || "")
        .split(/\n\s*\n/)
        .map((block, i) =>
          /^#{1,6} /.test(block) ? (
            <Heading key={i}>{clean(block.replace(/^#+\s*/, ""))}</Heading>
          ) : (
            <Label key={i}>{clean(block).replace(/^[-*] /gm, "• ")}</Label>
          ),
        )}
    </View>
  );
}

function PublicPlayer({ route, navigate }: ScreenProps) {
  const { t } = useDesign();
  const resource = useResource<any>(
    () => api.request(`/api/users/${encodeURIComponent(route.params?.id)}`),
    String(route.params?.id),
  );
  const data = resource.data;
  return (
    <Screen title={data?.user?.name || t("Игрок", "Player")}>
      <ResourceState resource={resource} />
      {data && (
        <>
          <Card>
            <Avatar
              name={data.user?.name || "?"}
              uri={assetUrl(data.user?.avatarUrl)}
              size={64}
            />
            <Heading>{data.user?.name}</Heading>
            {(data.user?.ratings?.combined ?? data.user?.rating) != null && (
              <Badge>
                MMR {data.user?.ratings?.combined ?? data.user?.rating}
              </Badge>
            )}
            <Row>
              <Label>
                {t("Игр", "Games")}: {data.stats?.matches ?? 0}
              </Label>
              <Label>
                {t("Побед", "Wins")}: {data.stats?.wins ?? 0}
              </Label>
              <Label>
                {t("Ничьих", "Draws")}: {data.stats?.draws ?? 0}
              </Label>
            </Row>
          </Card>
          <Grid>
            {(data.recentGames || []).map((game: any) => (
              <Card key={game.id}>
                <Heading>
                  {game.players?.map((p: any) => p.name).join(" — ")}
                </Heading>
                <Button
                  title={t("Открыть игру", "Open game")}
                  onPress={() => navigate("game", { id: game.id })}
                />
              </Card>
            ))}
          </Grid>
          {(data.playerTeams || []).map((team: any) => (
            <Button
              key={team.id}
              title={team.name}
              variant="secondary"
              onPress={() => navigate("team", { slug: team.slug })}
            />
          ))}
        </>
      )}
    </Screen>
  );
}

function PublicRoster({ route, navigate }: ScreenProps) {
  const { t } = useDesign();
  const resource = useResource<any>(
    () => api.roster(route.params?.id),
    String(route.params?.id),
  );
  const data = resource.data,
    roster = data?.roster;
  return (
    <Screen title={roster?.name || t("Состав", "Roster")}>
      <ResourceState resource={resource} />
      {roster && (
        <>
          <Card>
            <Heading>{roster.name}</Heading>
            <Label>{data.tournament?.name}</Label>
          </Card>
          <Grid>
            {(roster.members || []).map((m: any) => (
              <Card key={m.id}>
                <Heading>
                  {m.displayNameSnapshot || m.user?.name || m.name}
                </Heading>
                <Label>{m.factionSnapshot || ""}</Label>
                {m.userId && (
                  <Button
                    title={t("Профиль игрока", "Player profile")}
                    variant="secondary"
                    onPress={() => navigate("player", { id: m.userId })}
                  />
                )}
              </Card>
            ))}
          </Grid>
          {data.tournament?.slug && (
            <Button
              title={t("Открыть турнир", "Open tournament")}
              onPress={() =>
                navigate("tournament", { slug: data.tournament.slug })
              }
            />
          )}
        </>
      )}
    </Screen>
  );
}
