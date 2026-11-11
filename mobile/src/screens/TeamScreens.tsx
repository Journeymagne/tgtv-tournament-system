import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { api } from "../api/client";
import type { ScreenProps } from "../types";
import { reference } from "./reference";
import {
  Screen,
  Card,
  Button,
  TextField,
  Row,
  Label,
  Heading,
  Badge,
  Avatar,
  useDesign,
} from "../ui";
import {
  Choice,
  ConfirmAction,
  ResourceState,
  useResource,
  statusLabel,
} from "./player-shared";

export function TeamScreen({ route, navigate, session }: ScreenProps) {
  const { t } = useDesign();
  const slug = route.params?.slug;
  const resource = useResource<any>(
    () =>
      slug ? api.team(slug) : session?.user ? api.teamDashboard() : api.teams(),
    `${slug}:${session?.user?.id}`,
  );
  const [name, setName] = useState("");
  const data: any = resource.data;
  return (
    <Screen
      title={data?.team?.name || t("Команды и составы", "Teams and rosters")}
    >
      <ResourceState resource={resource} />
      {data && (
        <>
          {!slug ? (
            <>
              {(data.myTeams || data.teams || []).map((team: any) => (
                <Card key={team.id}>
                  <Heading>{team.name}</Heading>
                  <Label muted>{team.description || ""}</Label>
                  <Button
                    title={t("Открыть команду", "Open team")}
                    onPress={() => navigate("team", { slug: team.slug })}
                  />
                </Card>
              ))}
              {(data.incomingInvitations || [])
                .filter((x: any) => x.status === "pending")
                .map((invite: any) => (
                  <Card key={invite.id}>
                    <Heading>
                      {t("Приглашение в команду", "Team invitation")}
                    </Heading>
                    <Label>{invite.teamName || invite.team?.name}</Label>
                    <ConfirmAction
                      title={t("Принять", "Accept")}
                      description={t("Вступить в команду?", "Join this team?")}
                      onConfirm={async () => {
                        await api.respondToInvitation(invite.id, "accept");
                        await resource.reload();
                      }}
                    />
                    <ConfirmAction
                      title={t("Отклонить", "Decline")}
                      variant="secondary"
                      description={t(
                        "Отклонить приглашение?",
                        "Decline this invitation?",
                      )}
                      onConfirm={async () => {
                        await api.respondToInvitation(invite.id, "decline");
                        await resource.reload();
                      }}
                    />
                  </Card>
                ))}
              {session?.user && (
                <Card>
                  <Heading>{t("Создать команду", "Create team")}</Heading>
                  <TextField
                    label={t("Название", "Name")}
                    value={name}
                    onChangeText={setName}
                  />
                  <ConfirmAction
                    title={t("Создать", "Create")}
                    disabled={!name.trim()}
                    description={t(
                      "Создать команду с этим названием?",
                      "Create a team with this name?",
                    )}
                    onConfirm={async () => {
                      const result = await api.createTeam({
                        name: name.trim(),
                      });
                      navigate("team", { slug: result.team.slug });
                    }}
                  />
                </Card>
              )}
            </>
          ) : (
            <>
              <Card>
                <Heading>{data.team.name}</Heading>
                <Label>{data.team.description || ""}</Label>
              </Card>
              {(data.currentMembers || []).map((member: any) => (
                <Card key={member.id}>
                  <Row>
                    <Avatar
                      name={
                        member.user?.name ||
                        member.userName ||
                        member.name ||
                        member.displayNameSnapshot ||
                        "?"
                      }
                      uri={member.user?.avatarUrl}
                    />
                    <Heading>
                      {member.user?.name ||
                        member.userName ||
                        member.name ||
                        member.displayNameSnapshot}
                    </Heading>
                  </Row>
                  <Badge>
                    {member.role === "leader"
                      ? t("Лидер", "Leader")
                      : t("Участник", "Member")}
                  </Badge>
                </Card>
              ))}
              {(data.rosters || []).map((roster: any) => (
                <Card key={roster.id}>
                  <Heading>{roster.name}</Heading>
                  <Button
                    title={t("Открыть состав", "Open roster")}
                    variant="secondary"
                    onPress={() => navigate("roster", { id: roster.id })}
                  />
                  <Label>{roster.tournament?.name || ""}</Label>
                  {roster.tournament?.slug && (
                    <Button
                      title={t("Открыть турнир", "Open tournament")}
                      variant="secondary"
                      onPress={() =>
                        navigate("tournament", { slug: roster.tournament.slug })
                      }
                    />
                  )}
                </Card>
              ))}
              {(data.team.viewer?.isMember || data.team.viewer?.canAdmin) && (
                <InviteForm teamId={data.team.id} onDone={resource.reload} />
              )}
              <TeamManagement
                data={data}
                userId={session?.user?.id}
                onDone={resource.reload}
                onLeave={() => navigate("team")}
              />
            </>
          )}
          <Button
            title={t("Обновить", "Refresh")}
            variant="secondary"
            onPress={resource.reload}
          />
        </>
      )}
    </Screen>
  );
}

function TeamManagement({
  data,
  userId,
  onDone,
  onLeave,
}: {
  data: any;
  userId: number;
  onDone: () => Promise<void>;
  onLeave: () => void;
}) {
  const { t } = useDesign(),
    team = data.team,
    manage = team.viewer?.isLeader || team.viewer?.canAdmin;
  const [name, setName] = useState(team.name),
    [description, setDescription] = useState(team.description || ""),
    [successor, setSuccessor] = useState("");
  const base = `/api/teams/${encodeURIComponent(team.id)}`;
  const members = data.currentMembers || [];
  return (
    <>
      {manage && (
        <Card>
          <Heading>{t("Управление командой", "Manage team")}</Heading>
          <TextField
            label={t("Название", "Name")}
            value={name}
            onChangeText={setName}
          />
          <TextField
            label={t("Описание", "Description")}
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <ConfirmAction
            title={t("Сохранить", "Save")}
            description={t(
              "Сохранить изменения команды?",
              "Save these team changes?",
            )}
            onConfirm={async () => {
              await api.request(base, {
                method: "PATCH",
                body: { name, description },
              });
              await onDone();
            }}
          />
          <Choice
            label={t("Новый лидер", "New leader")}
            value={successor}
            options={members
              .filter((m: any) => m.userId !== team.leaderUserId)
              .map((m: any) => ({
                value: String(m.userId),
                label: m.user?.name || m.displayNameSnapshot,
              }))}
            onChange={setSuccessor}
          />
          <ConfirmAction
            title={t("Передать лидерство", "Transfer leadership")}
            variant="danger"
            disabled={!successor}
            description={t(
              "Передать управление командой выбранному участнику?",
              "Give team leadership to the selected member?",
            )}
            onConfirm={async () => {
              await api.request(base + "/leadership", {
                method: "POST",
                body: { userId: Number(successor) },
              });
              await onDone();
            }}
          />
          {members
            .filter((m: any) => m.userId !== userId)
            .map((member: any) => (
              <ConfirmAction
                key={member.id}
                title={`${t("Исключить", "Remove")}: ${member.user?.name || member.displayNameSnapshot}`}
                variant="danger"
                description={t(
                  "Исключить игрока из команды? Составы незавершённых турниров могут блокировать это действие.",
                  "Remove this member? Active tournament rosters may prevent removal.",
                )}
                onConfirm={async () => {
                  await api.request(base + `/members/${member.id}/remove`, {
                    method: "POST",
                  });
                  await onDone();
                }}
              />
            ))}
          {!team.archivedAt && (
            <ConfirmAction
              title={t("Архивировать команду", "Archive team")}
              variant="danger"
              description={t(
                "Архивировать команду? История сохранится.",
                "Archive this team? Its history will remain.",
              )}
              onConfirm={async () => {
                await api.request(base + "/archive", { method: "POST" });
                await onDone();
              }}
            />
          )}
          {team.viewer?.canDelete && (
            <ConfirmAction
              title={t("Удалить команду", "Delete team")}
              variant="danger"
              description={t(
                "Удалить команду безвозвратно? Сервер проверит отсутствие связанных матчей.",
                "Permanently delete this team? The server will verify there are no linked matches.",
              )}
              onConfirm={async () => {
                await api.request(base, { method: "DELETE" });
                onLeave();
              }}
            />
          )}
        </Card>
      )}
      {team.viewer?.isMember && (
        <ConfirmAction
          title={t("Покинуть команду", "Leave team")}
          variant="danger"
          description={t(
            "Покинуть команду? Если вы лидер, сервер назначит преемника или архивирует пустую команду.",
            "Leave the team? If you are its leader, the server will select a successor or archive an empty team.",
          )}
          onConfirm={async () => {
            await api.request(base + "/leave", { method: "POST" });
            onLeave();
          }}
        />
      )}
    </>
  );
}

function InviteForm({
  teamId,
  onDone,
}: {
  teamId: number;
  onDone: () => Promise<void>;
}) {
  const { t } = useDesign();
  const [query, setQuery] = useState(""),
    [searched, setSearched] = useState(""),
    [chosen, setChosen] = useState("");
  const resource = useResource(
    () =>
      searched ? api.searchUsers(searched) : Promise.resolve({ users: [] }),
    searched,
  );
  const data: any = resource.data;
  return (
    <Card>
      <Heading>{t("Пригласить игрока", "Invite player")}</Heading>
      <TextField
        label={t("Поиск игрока", "Find a player")}
        value={query}
        onChangeText={setQuery}
      />
      <Button
        title={t("Найти", "Search")}
        variant="secondary"
        onPress={() => setSearched(query.trim())}
        disabled={query.trim().length < 2}
      />
      <ResourceState resource={resource} />
      {Boolean(data?.users?.length) && (
        <>
          <Choice
            label={t("Игрок", "Player")}
            value={chosen}
            options={data.users.map((u: any) => ({
              value: String(u.id),
              label: u.name,
            }))}
            onChange={setChosen}
          />
          <ConfirmAction
            title={t("Пригласить", "Invite")}
            description={t(
              "Отправить приглашение выбранному игроку?",
              "Send this player a team invitation?",
            )}
            disabled={!chosen}
            onConfirm={async () => {
              await api.inviteMember(teamId, Number(chosen));
              setChosen("");
              await onDone();
            }}
          />
        </>
      )}
    </Card>
  );
}

export function RosterRegistration({ route, navigate, session }: ScreenProps) {
  const { t } = useDesign();
  const rosterId = route.params?.rosterId;
  const resource = useResource<any>(
    async () => ({
      ...(await api.teamDashboard()),
      event: await api.tournament(route.params?.slug),
      existing: rosterId ? await api.roster(rosterId) : null,
    }),
    `${route.params?.slug}:${rosterId}`,
  );
  const [teamId, setTeamId] = useState(""),
    [name, setName] = useState(""),
    [members, setMembers] = useState<any[]>([]),
    [captain, setCaptain] = useState("");
  const roster = useResource(
    () =>
      teamId
        ? api.teamMembers(teamId)
        : Promise.resolve({ currentMembers: [] }),
    teamId,
  );
  const data: any = resource.data,
    memberData: any = roster.data;
  const event = data?.event?.tournament,
    count = Number(event?.teamSize || 3);
  const initialized = useRef(false);
  useEffect(() => {
    const existing = data?.existing?.roster;
    if (!existing || initialized.current) return;
    initialized.current = true;
    setTeamId(String(existing.teamId));
    setName(existing.name);
    setCaptain(String(existing.captainUserId || ""));
    setMembers(
      (existing.members || [])
        .filter((m: any) => !m.endedAt)
        .map((m: any) => ({
          userId: String(m.userId || ""),
          factions: (m.factions || [m.factionSnapshot])
            .filter(Boolean)
            .join("\n"),
        })),
    );
  }, [data?.existing]);
  const current = memberData?.currentMembers || [];
  function choose(index: number, key: string, value: string) {
    setMembers((old) => {
      const result = [...old];
      result[index] = { ...result[index], [key]: value };
      return result;
    });
  }
  const selected = members.map((m) => Number(m?.userId)).filter(Boolean),
    valid =
      selected.length === count &&
      new Set(selected).size === count &&
      selected.includes(Number(captain)) &&
      (rosterId ||
        event?.viewer?.canAdmin ||
        selected.includes(session?.user?.id)) &&
      members.every(
        (m) =>
          (m.factions || "").split("\n").filter(Boolean).length ===
          Number(event.factionCount || 1),
      );
  return (
    <Screen
      title={
        rosterId
          ? t("Изменить состав", "Edit roster")
          : t("Регистрация состава", "Register roster")
      }
    >
      <ResourceState resource={resource} />
      {event && (
        <>
          <Card>
            <Heading>{event.name}</Heading>
            <Choice
              label={t("Команда", "Team")}
              value={teamId}
              disabled={Boolean(rosterId)}
              options={(event.viewer?.canAdmin
                ? data.teams || []
                : data.myTeams || []
              ).map((team: any) => ({
                value: String(team.id),
                label: team.name,
              }))}
              onChange={(v) => {
                setTeamId(v);
                setMembers([]);
                setCaptain("");
              }}
            />
            <TextField
              label={t("Название состава", "Roster name")}
              value={name}
              onChangeText={setName}
            />
            <Label>
              {t(
                "Каждый игрок должен состоять в выбранной команде.",
                "Every player must belong to the selected team.",
              )}
            </Label>
          </Card>
          <ResourceState resource={roster} />
          {teamId &&
            Array.from({ length: count }, (_, i) => (
              <Card key={i}>
                <Heading>
                  {t("Игрок", "Player")} {i + 1}
                </Heading>
                <Choice
                  label={t("Участник", "Member")}
                  value={members[i]?.userId || ""}
                  options={current.map((m: any) => ({
                    value: String(m.userId),
                    label:
                      m.user?.name ||
                      m.userName ||
                      m.name ||
                      m.displayNameSnapshot ||
                      String(m.userId),
                  }))}
                  onChange={(v) => choose(i, "userId", v)}
                />
                <RosterFactions
                  value={members[i]?.factions || ""}
                  count={Number(event.factionCount || 1)}
                  onChange={(v) => choose(i, "factions", v)}
                />
              </Card>
            ))}
          <Card>
            <Choice
              label={t("Капитан состава", "Roster captain")}
              value={captain}
              options={current
                .filter((m: any) => selected.includes(m.userId))
                .map((m: any) => ({
                  value: String(m.userId),
                  label:
                    m.user?.name ||
                    m.userName ||
                    m.name ||
                    m.displayNameSnapshot ||
                    String(m.userId),
                }))}
              onChange={setCaptain}
            />
            <ConfirmAction
              title={
                rosterId
                  ? t("Сохранить состав", "Save roster")
                  : t("Зарегистрировать состав", "Register roster")
              }
              disabled={!valid}
              description={t(
                "Подтвердить состав и капитана?",
                "Confirm this roster and captain?",
              )}
              onConfirm={async () => {
                await (
                  rosterId
                    ? (body: any) => api.updateRoster(event.id, rosterId, body)
                    : (body: any) => api.registerRoster(event.id, body)
                )({
                  teamId: Number(teamId),
                  name: name.trim(),
                  captainUserId: Number(captain),
                  members: members.map((m) => ({
                    userId: Number(m.userId),
                    factions: m.factions
                      .split("\n")
                      .map((f: string) => f.trim())
                      .filter(Boolean),
                  })),
                });
                navigate("tournament", { slug: event.slug });
              }}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}

function RosterFactions({
  value,
  count,
  onChange,
}: {
  value: string;
  count: number;
  onChange: (value: string) => void;
}) {
  const { t } = useDesign();
  const selected = value.split("\n");
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <Choice
          key={i}
          label={`${t("Фракция", "Faction")} ${i + 1}`}
          value={selected[i] || ""}
          options={reference.killTeams.filter(
            (f) => !selected.includes(f) || selected[i] === f,
          )}
          onChange={(v) => {
            const next = [...selected];
            next[i] = v;
            onChange(next.join("\n"));
          }}
        />
      ))}
    </View>
  );
}

export function PairingScreen({ route, navigate, session }: ScreenProps) {
  const { t } = useDesign();
  const id = route.params?.id || route.params?.matchId;
  const resource = useResource(() => api.pairing(id), String(id));
  const data: any = resource.data,
    match = data?.teamMatch;
  const [chosen, setChosen] = useState(""),
    [kind, setKind] = useState("table"),
    [adminSide, setAdminSide] = useState("a");
  useEffect(() => {
    setChosen("");
  }, [match?.pairingRevision]);
  const ownSide =
    match?.rosterA?.captainUserId === session?.user?.id
      ? "a"
      : match?.rosterB?.captainUserId === session?.user?.id
        ? "b"
        : null;
  const isAdmin = Boolean(data?.tournament?.viewer?.canAdmin),
    side = ownSide || (isAdmin ? adminSide : null),
    roster = side === "a" ? match?.rosterA : match?.rosterB;
  const confirmed =
    match?.[
      `${match?.phase === "sword_selection" ? "sword" : "shield"}${side?.toUpperCase()}Confirmed`
    ];
  const choiceSide =
    match?.phase === "sword_selection" ? (side === "a" ? "b" : "a") : side;
  const choiceRoster = choiceSide === "a" ? match?.rosterA : match?.rosterB;
  const availableMembers = (choiceRoster?.members || []).filter(
    (m: any) =>
      !m.endedAt &&
      !(
        match.phase === "sword_selection" &&
        m.id === match["shield" + choiceSide?.toUpperCase() + "MemberId"]
      ),
  );
  const next =
      match?.nextAction ||
      legacyEnvironmentStep(match, data?.tournament?.venueMode),
    canAct = Boolean(
      side && !match?.resolution && data?.tournament?.status === "in_progress",
    );
  async function act(action: any, body: any) {
    await api.pairingAction(data.tournament.id, match.id, action, {
      ...body,
      side,
      revision: match.pairingRevision,
    });
    setChosen("");
    await resource.reload();
  }
  const chooseTitle =
    match?.phase === "shield_selection"
      ? t("Выберите щит", "Choose Shield")
      : t("Выберите меч", "Choose Sword");
  const missions = (match?.missions || [])
    .map((m: any) => m.critOp)
    .filter(
      (mission: string) =>
        !(match?.missionBans || []).some((b: any) => b.mission === mission) &&
        !(match?.environment?.assignments || []).some(
          (a: any) => a.mission?.critOp === mission,
        ),
    );
  const tables = (match?.tables || []).filter(
    (table: any) =>
      !(match?.environment?.assignments || []).some(
        (a: any) => a.tableId === table.id,
      ),
  );
  const environmentKind = next?.kind === "either" ? kind : next?.kind;
  return (
    <Screen title={t("Командный пейринг", "Team pairing")}>
      <ResourceState resource={resource} />
      {match && (
        <>
          <Card>
            <Heading>
              {match.rosterA?.name} — {match.rosterB?.name || "BYE"}
            </Heading>
            <Badge>{statusLabel(match.phase, t)}</Badge>
            <Label muted>{data.tournament.name}</Label>
            {!side && (
              <Label>
                {t(
                  "Вы наблюдаете за пейрингом. Действия доступны капитанам.",
                  "You are viewing this pairing. Captains can make selections.",
                )}
              </Label>
            )}
            {isAdmin && !ownSide && (
              <Choice
                label={t("Действовать от стороны", "Act for side")}
                value={adminSide}
                options={[
                  { value: "a", label: match.rosterA?.name || "A" },
                  { value: "b", label: match.rosterB?.name || "B" },
                ]}
                onChange={(v) => {
                  setAdminSide(v);
                  setChosen("");
                }}
              />
            )}
          </Card>
          {canAct &&
            match.phase === "awaiting_roll" &&
            match.captainPairingEnabled !== false && (
              <Card>
                {match.pairingType === "sword_shield_classic" ? (
                  <>
                    <Choice
                      label={t("Победитель инициативы", "Initiative winner")}
                      value={chosen}
                      options={[
                        { value: "a", label: match.rosterA.name },
                        { value: "b", label: match.rosterB.name },
                      ]}
                      onChange={setChosen}
                    />
                    <ConfirmAction
                      title={t("Зафиксировать инициативу", "Record initiative")}
                      disabled={!chosen}
                      description={t(
                        "Подтвердить победителя инициативы?",
                        "Confirm the initiative winner?",
                      )}
                      onConfirm={() =>
                        act("initiative", { winnerSide: chosen })
                      }
                    />
                  </>
                ) : (
                  <>
                    <Label>
                      {t(
                        "Бросок D6 выполняется на сервере.",
                        "The D6 is rolled on the server.",
                      )}
                    </Label>
                    <ConfirmAction
                      title={t("Бросить D6", "Roll D6")}
                      disabled={Boolean(
                        match.rollHistory?.[match.rollRound - 1]?.[side!],
                      )}
                      description={t(
                        "Сделать бросок инициативы?",
                        "Roll for initiative?",
                      )}
                      onConfirm={() =>
                        act("roll", { rollRound: match.rollRound })
                      }
                    />
                  </>
                )}
              </Card>
            )}
          {canAct && match.phase === "mission_ban" && next?.side === side && (
            <Card>
              <Choice
                label={t("Миссия для бана", "Mission to ban")}
                value={chosen}
                options={missions}
                onChange={setChosen}
              />
              <ConfirmAction
                title={t("Забанить миссию", "Ban mission")}
                disabled={!chosen}
                description={t(
                  "Исключить выбранную миссию?",
                  "Exclude this mission?",
                )}
                onConfirm={() => act("ban", { mission: chosen })}
              />
            </Card>
          )}
          {canAct &&
            ["shield_selection", "sword_selection"].includes(match.phase) && (
              <Card>
                {confirmed ? (
                  <Label>
                    {t(
                      "Выбор подтверждён. Ожидаем второго капитана.",
                      "Selection confirmed. Waiting for the other captain.",
                    )}
                  </Label>
                ) : (
                  <>
                    <Choice
                      label={chooseTitle}
                      value={chosen}
                      options={availableMembers.map((m: any) => ({
                        value: String(m.id),
                        label:
                          m.displayNameSnapshot ||
                          m.name ||
                          m.user?.name ||
                          String(m.id),
                      }))}
                      onChange={setChosen}
                    />
                    <Label muted>
                      {t(
                        "Выбор соперника скрыт до подтверждения обеими сторонами.",
                        "The opponent’s selection stays hidden until both captains confirm.",
                      )}
                    </Label>
                    <ConfirmAction
                      title={t("Подтвердить выбор", "Confirm selection")}
                      disabled={!chosen}
                      description={t(
                        "Зафиксировать выбранного игрока?",
                        "Confirm the selected player?",
                      )}
                      onConfirm={() =>
                        act(
                          match.phase === "shield_selection"
                            ? "shield"
                            : "sword",
                          { memberId: Number(chosen), confirm: true },
                        )
                      }
                    />
                  </>
                )}
              </Card>
            )}
          {canAct &&
            match.phase === "environment_selection" &&
            next?.side === side && (
              <Card>
                <Heading>
                  {t("Пара", "Pair")} {next.slot}
                </Heading>
                {next.kind === "either" && (
                  <Choice
                    label={t("Что выбираем", "Choose first")}
                    value={kind}
                    options={[
                      { value: "table", label: t("Стол", "Table") },
                      { value: "mission", label: t("Миссия", "Mission") },
                    ]}
                    onChange={(v) => {
                      setKind(v);
                      setChosen("");
                    }}
                  />
                )}
                <Choice
                  label={
                    environmentKind === "table"
                      ? t("Стол", "Table")
                      : t("Миссия", "Mission")
                  }
                  value={chosen}
                  options={
                    environmentKind === "table"
                      ? tables.map((table: any) => ({
                          value: String(table.id),
                          label: `${t("Стол", "Table")} ${table.tableNumber} · ${table.killzone || ""}`,
                        }))
                      : missions
                  }
                  onChange={setChosen}
                />
                <ConfirmAction
                  title={t("Подтвердить назначение", "Confirm assignment")}
                  disabled={!chosen}
                  description={t(
                    "Зафиксировать назначение этой пары?",
                    "Confirm this pair’s assignment?",
                  )}
                  onConfirm={() =>
                    act("environment", {
                      step: match.environment?.step || 0,
                      kind: environmentKind,
                      ...(environmentKind === "table"
                        ? { tableId: Number(chosen) }
                        : { mission: chosen }),
                    })
                  }
                />
              </Card>
            )}
          {canAct && next?.side && next.side !== side && (
            <Card>
              <Label>
                {t(
                  "Сейчас ход другого капитана. Обновите экран после его выбора.",
                  "It is the other captain’s turn. Refresh after their selection.",
                )}
              </Label>
            </Card>
          )}
          {canAct &&
            match.phase === "environment_selection" &&
            match.captainPairingEnabled === false && (
              <ManualPairing
                match={match}
                onSubmit={(body) => act("manual", body)}
              />
            )}
          {(match.games || []).map((link: any) => (
            <Card key={link.id}>
              <Heading>
                {t("Игра", "Game")} {link.slot}
              </Heading>
              <Label>
                {(link.game?.players || []).map((p: any) => p.name).join(" — ")}
              </Label>
              <Label muted>
                {link.mission?.critOp || ""} · {t("Стол", "Table")}{" "}
                {link.table?.tableNumber ?? "—"}
              </Label>
              {link.game?.id && (
                <Button
                  title={t("Открыть игру", "Open game")}
                  onPress={() => navigate("game", { id: link.game.id })}
                />
              )}
            </Card>
          ))}
          {canAct && match.canUndo && (
            <ConfirmAction
              title={t("Отменить последний шаг", "Undo last step")}
              variant="danger"
              description={
                match.undoResetsResults
                  ? t(
                      "Отмена затронет уже введённые результаты. Продолжить?",
                      "Undoing affects recorded results. Continue?",
                    )
                  : t(
                      "Вернуть пейринг на предыдущий шаг?",
                      "Return to the previous pairing step?",
                    )
              }
              onConfirm={() =>
                act("undo", {
                  confirmResultsReset: Boolean(match.undoResetsResults),
                })
              }
            />
          )}
          <Button
            title={t("Обновить пейринг", "Refresh pairing")}
            variant="secondary"
            disabled={resource.loading}
            onPress={() => {
              setChosen("");
              void resource.reload();
            }}
          />
          {data.tournament?.slug && (
            <Button
              title={t("К турниру", "Back to tournament")}
              variant="secondary"
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

function legacyEnvironmentStep(match: any, venue: string) {
  if (
    !match ||
    match.pairingVersion === 2 ||
    match.phase !== "environment_selection" ||
    match.captainPairingEnabled === false
  )
    return null;
  const attacker = match.attackerRosterId === match.rosterAId ? "a" : "b",
    defender = attacker === "a" ? "b" : "a";
  const attackerSlot = match.pairings?.find(
    (p: any) => p.shieldOwner === attacker,
  )?.slot;
  const defenderSlot = match.pairings?.find(
    (p: any) => p.shieldOwner === defender,
  )?.slot;
  if (!attackerSlot || !defenderSlot) return null;
  const plan =
    venue === "tts"
      ? [
          { side: attacker, kind: "mission", slot: defenderSlot },
          { side: defender, kind: "mission", slot: attackerSlot },
        ]
      : [
          { side: defender, kind: "table", slot: defenderSlot },
          { side: attacker, kind: "mission", slot: defenderSlot },
          { side: attacker, kind: "table", slot: attackerSlot },
          { side: defender, kind: "mission", slot: attackerSlot },
        ];
  return plan[Number(match.environment?.step || 0)] || null;
}

function ManualPairing({
  match,
  onSubmit,
}: {
  match: any;
  onSubmit: (body: any) => Promise<void>;
}) {
  const { t } = useDesign();
  const [pairs, setPairs] = useState<any[]>([]);
  const count = match.pairingType === "doubles" ? 2 : 3;
  function change(index: number, key: string, value: string) {
    setPairs((old) => {
      const next = [...old];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }
  const valid =
    pairs.length === count &&
    pairs.every(
      (p) => p.rosterAMemberId && p.rosterBMemberId && p.tableId && p.mission,
    );
  return (
    <Card>
      <Heading>{t("Ручное назначение пар", "Manual pairings")}</Heading>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ gap: 12 }}>
          <Heading>
            {t("Пара", "Pair")} {i + 1}
          </Heading>
          {(["a", "b"] as const).map((side) => (
            <Choice
              key={side}
              label={side === "a" ? match.rosterA.name : match.rosterB.name}
              value={pairs[i]?.[`roster${side.toUpperCase()}MemberId`] || ""}
              options={(side === "a" ? match.rosterA : match.rosterB).members
                .filter((m: any) => !m.endedAt)
                .map((m: any) => ({
                  value: String(m.id),
                  label: m.displayNameSnapshot || m.name,
                }))}
              onChange={(v) =>
                change(i, `roster${side.toUpperCase()}MemberId`, v)
              }
            />
          ))}
          <Choice
            label={t("Стол", "Table")}
            value={pairs[i]?.tableId || ""}
            options={match.tables.map((table: any) => ({
              value: String(table.id),
              label: String(table.tableNumber),
            }))}
            onChange={(v) => change(i, "tableId", v)}
          />
          <Choice
            label={t("Миссия", "Mission")}
            value={pairs[i]?.mission || ""}
            options={match.missions.map((m: any) => m.critOp)}
            onChange={(v) => change(i, "mission", v)}
          />
        </View>
      ))}
      <ConfirmAction
        title={t("Назначить пары", "Assign pairings")}
        disabled={!valid}
        description={t(
          "Создать игры с указанными парами и столами?",
          "Create games using these pairings and tables?",
        )}
        onConfirm={() =>
          onSubmit({
            pairings: pairs.map((p) => ({
              ...p,
              rosterAMemberId: Number(p.rosterAMemberId),
              rosterBMemberId: Number(p.rosterBMemberId),
              tableId: Number(p.tableId),
            })),
          })
        }
      />
    </Card>
  );
}
