import React, { useState } from "react";
import { api } from "../api/client";
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
  useDesign,
} from "../ui";
import {
  ConfirmAction,
  ResourceState,
  useResource,
  statusLabel,
  dateLabel,
} from "./player-shared";
import type { ScreenProps } from "../types";
type Data = Record<string, any>;
const array = (value: any): Data[] => (Array.isArray(value) ? value : []);

export function TournamentExtras(props: ScreenProps) {
  return props.route.name === "roster" ? (
    <RosterDetails {...props} />
  ) : (
    <TournamentStats {...props} />
  );
}

function RosterDetails({ route, navigate }: ScreenProps) {
  const { t, locale } = useDesign();
  const rosterId = route.params?.id || route.params?.rosterId;
  const resource = useResource<any>(
    () => api.roster(rosterId),
    String(rosterId),
  );
  const data = resource.data,
    roster = data?.roster;
  const [name, setName] = useState("");
  return (
    <Screen title={roster?.name || t("Состав команды", "Team roster")}>
      <ResourceState resource={resource} />
      {roster && (
        <>
          <Card>
            <Badge>{statusLabel(roster.status, t)}</Badge>
            <Heading>{data.tournament.name}</Heading>
            <Label muted>{roster.team?.name || roster.teamNameSnapshot}</Label>
            <Row>
              <Label>
                {t("Место", "Place")}: {data.standing?.rank ?? "—"}
              </Label>
              <Label>TP: {data.standing?.teamTournamentPoints ?? 0}</Label>
              <Label>VP: {data.standing?.totalVp ?? 0}</Label>
            </Row>
            <Label>
              {t("Победы / ничьи / поражения", "Wins / draws / losses")}:{" "}
              {data.standing?.wins ?? 0} / {data.standing?.draws ?? 0} /{" "}
              {data.standing?.losses ?? 0}
            </Label>
            <Label>
              {t("Победы игроков", "Individual wins")}:{" "}
              {data.standing?.individualWins ?? 0} · Tac Op:{" "}
              {data.standing?.tacOpPoints ?? 0}
            </Label>
          </Card>
          <Heading>
            {t("Игроки и история замен", "Players and roster history")}
          </Heading>
          <Grid>
            {array(roster.members)
              .slice()
              .sort(
                (a, b) =>
                  Number(Boolean(a.endedAt)) - Number(Boolean(b.endedAt)) ||
                  a.slot - b.slot,
              )
              .map((member) => (
                <Card key={member.id}>
                  <Heading>{member.displayNameSnapshot || member.name}</Heading>
                  {member.userId === roster.captainUserId &&
                    !member.endedAt && <Badge>{t("Капитан", "Captain")}</Badge>}
                  <Label muted>
                    {member.factionHidden
                      ? t("Фракции пока скрыты", "Factions are still hidden")
                      : array(member.factions).length
                        ? member.factions.join(" · ")
                        : member.factionSnapshot || "—"}
                  </Label>
                  {member.endedAt && (
                    <Label muted>
                      {t("Покинул состав", "Left roster")}:{" "}
                      {dateLabel(member.endedAt, locale)}
                    </Label>
                  )}
                  {member.userId && (
                    <Button
                      title={t("Профиль игрока", "Player profile")}
                      onPress={() => navigate("player", { id: member.userId })}
                    />
                  )}
                </Card>
              ))}
          </Grid>
          <Heading>
            {t("История командных матчей", "Team match history")}
          </Heading>
          {!array(data.teamMatches).length && (
            <Label>{t("Матчей пока нет", "No matches yet")}</Label>
          )}
          {array(data.teamMatches).map((match) => (
            <Card key={match.id}>
              <Heading>
                {t("Раунд", "Round")} {match.roundNumber}
              </Heading>
              <Label>
                {match.rosterA?.name} — {match.rosterB?.name || "BYE"}
              </Label>
              <Badge>{statusLabel(match.phase, t)}</Badge>
              <Label>
                TP {match.teamTournamentPointsA ?? "—"} :{" "}
                {match.teamTournamentPointsB ?? "—"}
              </Label>
              <Button
                title={t("Открыть пейринг", "Open pairing")}
                onPress={() => navigate("pairing", { id: match.id })}
              />
            </Card>
          ))}
          {data.viewer?.canRename && (
            <Card>
              <Heading>{t("Название состава", "Roster name")}</Heading>
              <TextField
                label={t("Новое название", "New name")}
                value={name}
                placeholder={roster.name}
                onChangeText={setName}
                maxLength={80}
              />
              <ConfirmAction
                title={t("Переименовать", "Rename")}
                disabled={name.trim().length < 2}
                description={t(
                  "Сохранить новое название состава?",
                  "Save this roster name?",
                )}
                onConfirm={async () => {
                  await api.updateRoster(data.tournament.id, roster.id, {
                    name: name.trim(),
                  });
                  setName("");
                  await resource.reload();
                }}
              />
            </Card>
          )}
          {!roster.isReserve &&
            !["withdrawn", "finished"].includes(roster.status) &&
            (data.viewer?.canEditDetails ||
              ((data.viewer?.isCaptain || data.viewer?.isTeamLeader) &&
                ["draft", "registration_open", "registration_closed"].includes(
                  data.tournament.status,
                ))) && (
              <Button
                title={t("Изменить состав", "Edit roster")}
                onPress={() =>
                  navigate("roster-registration", {
                    slug: data.tournament.slug,
                    rosterId: roster.id,
                  })
                }
              />
            )}
          {(data.viewer?.isCaptain ||
            data.viewer?.isTeamLeader ||
            data.viewer?.canEditDetails) &&
            ["registration_open", "registration_closed", "draft"].includes(
              data.tournament.status,
            ) &&
            !["withdrawn", "finished"].includes(roster.status) && (
              <ConfirmAction
                title={t("Отозвать состав", "Withdraw roster")}
                variant="danger"
                description={t(
                  "Отозвать этот состав из турнира?",
                  "Withdraw this roster from the tournament?",
                )}
                onConfirm={async () => {
                  await api.withdrawRoster(data.tournament.id, roster.id);
                  await resource.reload();
                }}
              />
            )}
          <Button
            title={t("К турниру", "Back to tournament")}
            onPress={() =>
              navigate("tournament", { slug: data.tournament.slug })
            }
          />
          {roster.team?.slug && (
            <Button
              title={t("К команде", "Open team")}
              onPress={() => navigate("team", { slug: roster.team.slug })}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function TournamentStats({ route, navigate }: ScreenProps) {
  const { t } = useDesign();
  const slug = route.params?.slug;
  const resource = useResource<any>(() => api.tournament(slug), String(slug)),
    data = resource.data;
  const [mode, setMode] = useState("factions");
  const games = array(data?.tournamentGames).filter(
    (g) => g.status === "completed" && g.result,
  );
  const participants =
    data?.tournament?.participantMode === "team"
      ? array(data.rosters)
          .filter((r) => r.status !== "withdrawn")
          .flatMap((r) => array(r.members).filter((m) => !m.endedAt))
      : array(data?.participants).filter(
          (p) => !["withdrawn", "removed"].includes(p.status),
        );
  const hidden = participants.some((p) => p.factionHidden),
    picks = new Map<string, number>();
  if (!hidden)
    for (const participant of participants)
      for (const faction of participant.factions?.length
        ? participant.factions
        : [participant.faction || participant.factionSnapshot].filter(Boolean))
        picks.set(faction, (picks.get(faction) || 0) + 1);
  const factions = new Map<string, Data>(),
    tacOps = new Map<string, Data>();
  const stat = (map: Map<string, Data>, name: string) => {
    if (!map.has(name))
      map.set(name, {
        name,
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        totalVp: 0,
        vpDiff: 0,
        tac: 0,
        primaryTac: 0,
        primaryCount: 0,
      });
    return map.get(name)!;
  };
  for (const faction of picks.keys()) stat(factions, faction);
  for (const game of games) {
    const [a, b] = array(game.players);
    if (!a || !b) continue;
    for (const [player, opponent] of [
      [a, b],
      [b, a],
    ]) {
      const score = game.result.scores?.[player.id];
      if (!score) continue;
      const row = stat(
        factions,
        score.faction ||
          player.faction ||
          t("Фракция не указана", "Unspecified faction"),
      );
      row.games++;
      row.totalVp += Number(score.total || 0);
      row.vpDiff +=
        Number(score.total || 0) -
        Number(game.result.scores?.[opponent.id]?.total || 0);
      const win = Number(game.result.winnerId) === Number(player.id),
        draw = game.result.winnerId == null;
      if (win) row.wins++;
      else if (draw) row.draws++;
      else row.losses++;
      if (score.tacOp) {
        const tac = stat(tacOps, score.tacOp);
        tac.games++;
        if (win) tac.wins++;
        tac.tac += Number(score.tac || 0);
        if (score.primary === "tac") {
          tac.primaryCount++;
          tac.primaryTac +=
            Number(score.tac || 0) + Number(score.primaryBonus || 0);
        }
      }
    }
  }
  const rows = [...(mode === "factions" ? factions : tacOps).values()].sort(
    (a, b) =>
      b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name),
  );
  return (
    <Screen title={t("Статистика турнира", "Tournament statistics")}>
      <ResourceState resource={resource} />
      {data && (
        <>
          <Card>
            <Heading>{data.tournament.name}</Heading>
            <Row>
              <Label>
                {t("Завершено игр", "Completed games")}: {games.length}
              </Label>
              <Label>
                {t("Фракций", "Factions")}: {factions.size}
              </Label>
              <Label>Tac Ops: {tacOps.size}</Label>
            </Row>
            <Label muted>
              {t(
                "Учитываются только подтверждённые личные результаты, включая игры ещё не завершённых командных матчей.",
                "Only finalized individual results count, including games in team matches still in progress.",
              )}
            </Label>
          </Card>
          <Row>
            <Button
              title={t("Фракции", "Factions")}
              variant={mode === "factions" ? "primary" : "secondary"}
              onPress={() => setMode("factions")}
            />
            <Button
              title="Tac Ops"
              variant={mode === "tac" ? "primary" : "secondary"}
              onPress={() => setMode("tac")}
            />
          </Row>
          {hidden && mode === "factions" && (
            <Label muted>
              {t(
                "Количество заявок по фракциям скрыто до раскрытия всех составов.",
                "Faction pick counts are hidden until all rosters are revealed.",
              )}
            </Label>
          )}
          {!rows.length && (
            <Label>
              {t(
                "Данных для статистики пока нет",
                "No statistics available yet",
              )}
            </Label>
          )}
          <Grid>
            {rows.map((row) => (
              <Card key={row.name}>
                <Heading>{row.name}</Heading>
                <Label>
                  {t("Игр", "Games")}: {row.games} · {t("Побед", "Wins")}:{" "}
                  {row.wins} ·{" "}
                  {row.games ? Math.round((row.wins / row.games) * 100) : 0}%
                </Label>
                {mode === "factions" ? (
                  <>
                    <Label>
                      {t("Заявок", "Picks")}:{" "}
                      {hidden ? "—" : picks.get(row.name) || 0}
                    </Label>
                    <Label>
                      {t("Ничьи / поражения", "Draws / losses")}: {row.draws} /{" "}
                      {row.losses}
                    </Label>
                    <Label>
                      VP: {row.totalVp} · {t("Разница VP", "VP difference")}:{" "}
                      {row.vpDiff}
                    </Label>
                  </>
                ) : (
                  <>
                    <Label>
                      {t("Средние очки Tac", "Average Tac points")}:{" "}
                      {row.games ? (row.tac / row.games).toFixed(2) : "—"}
                    </Label>
                    <Label>
                      {t("С основной операцией", "As primary operation")}:{" "}
                      {row.primaryCount
                        ? (row.primaryTac / row.primaryCount).toFixed(2)
                        : "—"}
                    </Label>
                  </>
                )}
              </Card>
            ))}
          </Grid>
          <Button
            title={t("К турниру", "Back to tournament")}
            onPress={() => navigate("tournament", { slug })}
          />
        </>
      )}
    </Screen>
  );
}
