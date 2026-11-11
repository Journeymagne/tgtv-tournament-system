import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, View } from 'react-native';
import { api } from '../api/client';
import { Screen, Card, Button, TextField, Row, Label, Heading, Badge, useDesign } from '../ui';
import { ScreenProps } from '../types';
import { Choice } from './player-shared';
import { reference } from './reference';

type Data = Record<string, any>;
type Confirm = { title: string; perform: () => Promise<unknown>; done?: (value: any) => void; path: string; method: 'POST' | 'PATCH' | 'DELETE'; body: Data; warnings?: Data[] };
const list = (value: any): Data[] => Array.isArray(value) ? value : [];
const id = (value: any) => encodeURIComponent(String(value));
const participantName = (p: any) => p?.displayName || p?.name || p?.displayNameSnapshot || '—';
const resultKey = (p: any) => p?.resultKey ?? p?.userId ?? -p?.id;

/** One component per navigation entry keeps drafts scoped to that resource. */
export function OrganizerScreen(props: ScreenProps) {
  return <OrganizerPage key={JSON.stringify(props.route)} {...props} />;
}

function OrganizerPage({ route, navigate, session }: ScreenProps) {
  const { t, colors, wide } = useDesign();
  const params = route.params || {};
  const tournamentId = params.tournamentId || params.id;
  const base = tournamentId ? `/api/admin/tournaments/${id(tournamentId)}` : '';
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const [uncertainWrite, setUncertainWrite] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [form, setForm] = useState<Data>({});
  const [preview, setPreview] = useState<Data | null>(null);
  const [users, setUsers] = useState<Data[]>([]);
  const active = useRef(true);
  const pending = useRef(false);
  const loadSeq = useRef(0);
  const user = session?.user;
  const canCreate = user?.isAdmin || user?.isSuperAdmin || user?.canCreateTournaments || user?.capabilities?.canCreateTournaments;
  const field = (key: string, value: any) => setForm(previous => ({ ...previous, [key]: value }));
  const change = (key: string) => (value: string) => field(key, value);
  const pathname = !base ? `/api/admin/tournaments?page=${page}`
    : route.name === 'org-audit' ? `${base}/audit?page=${page}`
    : route.name === 'org-pairings' ? `${base}/rounds/${id(params.roundId)}/pairings`
    : route.name === 'org-round-tables' ? `${base}/rounds/${id(params.roundId)}/tables`
    : base;

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (route.name === 'org-create') { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const value = await api.request<Data>(pathname);
      if (active.current && seq === loadSeq.current) { setData(value); setUncertainWrite(false); }
    } catch (e: any) { if (active.current && seq === loadSeq.current) setError(e.message); }
    finally { if (active.current && seq === loadSeq.current) setLoading(false); }
  }, [pathname, route.name]);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; }; }, [load]);

  const run = async (operation: () => Promise<any>, done?: (value: any) => void) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const value = await operation();
      if (!active.current) return;
      setConfirm(null); setNotice(t('Изменения сохранены', 'Changes saved'));
      if (done) done(value); else await load();
    } catch (e: any) {
      if (active.current) {
        const review = e.details?.pairingWarningReview;
        if (review?.warningKey && confirm) {
          const body = { ...confirm.body, pairingWarningAcknowledgement: review.warningKey };
          setConfirm({ ...confirm, body, warnings: review.warnings, perform: () => api.request(confirm.path, { method: confirm.method, body }) });
        }
        setError(e.writeOutcomeUnknown
          ? t('Ответ не получен. Запись могла сохраниться. Обновите данные перед повтором.', 'No response. The write may have succeeded. Refresh before trying again.')
          : e.message);
        if (e.writeOutcomeUnknown) { setConfirm(null); setUncertainWrite(true); }
      }
    } finally { pending.current = false; if (active.current) setBusy(false); }
  };
  const mutate = (title: string, path: string, method: 'POST' | 'PATCH' | 'DELETE' = 'POST', body: any = {}, done?: (value: any) => void) => {
    if (uncertainWrite) { setError(t('Сначала обновите данные: исход предыдущей записи неизвестен.', 'Refresh first: the outcome of the previous write is unknown.')); return; }
    setConfirm({ title, path, method, body, perform: () => api.request(path, { method, body }), done });
  };
  const go = (name: string, extra: Data = {}) => navigate(name, { tournamentId, ...extra });
  const tournament = data?.tournament || {};
  const participants = list(data?.participants);
  const rosters = list(data?.rosters);
  const rounds = list(data?.rounds);
  const matches = rounds.flatMap(round => list(round.matches));
  const team = tournament.participantMode === 'team';
  const editable = !['completed', 'cancelled'].includes(tournament.status);
  const titleMap: Record<string, string> = {
    organizer: t('Пульт организатора', 'Organizer'), 'org-create': t('Создать турнир', 'Create tournament'),
    'org-edit': t('Настройки турнира', 'Tournament settings'), 'org-registrations': t('Участники и оплата', 'Registrations & payment'),
    'org-rounds': t('Управление раундами', 'Manage rounds'), 'org-tables': t('Столы и миссии', 'Tables & missions'),
    'org-result': t('Исправить результат', 'Correct result'), 'org-staff': t('Сотрудники турнира', 'Tournament staff'),
    'org-audit': t('История изменений', 'Audit history'), 'org-pairings': t('Редактор пар', 'Edit pairings'),
    'org-seeds': t('Посев участников', 'Participant seeding'),
    'org-round-tables': t('Столы раунда', 'Round tables'),
    'org-team-result': t('Результат командной игры', 'Team game result'),
  };
  const footer = <>
    {!!error && <Card><Label>{error}</Label><Button title={t('Обновить данные', 'Refresh data')} onPress={() => void load()} disabled={busy} /></Card>}
    {!!notice && <Label>{notice}</Label>}
    <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => { if (!busy) setConfirm(null); }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.62)', justifyContent: 'center', padding: 20 }}><ScrollView contentContainerStyle={{ width: '100%', maxWidth: 560, alignSelf: 'center', flexGrow: 1, justifyContent: 'center' }}>
      {!!confirm && <Card><Heading>{t('Подтверждение', 'Confirmation')}</Heading><Label>{confirm.title}</Label>
      {list(confirm.warnings).map((warning, index) => <Label key={index}>{warning.kind === 'table_repeat' ? t('Повтор стола', 'Repeated table') : t('Повторная встреча', 'Rematch')}: {(warning.names || []).join(' / ')} · {t('Раунды', 'Rounds')} {(warning.rounds || []).join(', ')}</Label>)}
      {!!error && <Label>{error}</Label>}
      <Label muted>{t('Изменение будет сохранено в общей базе турнира.', 'This change will be saved to the shared tournament database.')}</Label>
      <Row><Button title={busy ? t('Сохранение…', 'Saving…') : t('Подтвердить', 'Confirm')} variant="primary" onPress={() => void run(confirm.perform, confirm.done)} disabled={busy} />
        <Button title={t('Отмена', 'Cancel')} variant="secondary" onPress={() => setConfirm(null)} disabled={busy} /></Row></Card>}
      </ScrollView></View></Modal>
  </>;
  const options = (key: string, values: [any, string][], selected?: any) => <Row>{values.map(([value, label]) => <Button key={String(value)} title={label} variant={(form[key] ?? selected) === value ? 'primary' : 'secondary'} disabled={busy} onPress={() => field(key, value)} />)}</Row>;
  const pager = <Row><Button title={t('Назад', 'Previous')} variant="secondary" disabled={page === 1 || busy} onPress={() => setPage(page - 1)} /><Label>{String(page)}</Label><Button title={t('Далее', 'Next')} variant="secondary" disabled={busy || !(data?.pagination?.hasNext || page < Number(data?.pagination?.totalPages || 1))} onPress={() => setPage(page + 1)} /></Row>;

  if (!user) return <Screen title={t('Войдите в аккаунт', 'Sign in')}><Button title={t('Войти', 'Sign in')} onPress={() => navigate('login')} /></Screen>;
  if (route.name === 'org-create' && !canCreate) return <Screen title={t('Недостаточно прав', 'Permission required')}><Label>{t('Создание турниров доступно организаторам с разрешением.', 'Creating tournaments requires organizer permission.')}</Label></Screen>;
  if (loading && !data) return <Screen title={titleMap[route.name] || titleMap.organizer}><ActivityIndicator color={colors.accent} />{footer}</Screen>;
  if (route.name !== 'org-create' && !data) return <Screen title={titleMap[route.name] || titleMap.organizer}>{footer}</Screen>;

  // Any organizer sub-screen without a selected tournament first opens a real selector.
  if (!base && route.name !== 'org-create') return <Screen title={titleMap[route.name] || titleMap.organizer}>
    {canCreate && <Button title={t('Создать турнир', 'Create tournament')} onPress={() => navigate('org-create')} />}
    {!list(data?.tournaments).length && <Card><Label>{t('Нет доступных турниров для управления', 'No tournaments available to manage')}</Label></Card>}
    {list(data?.tournaments).map(item => <Card key={item.id}><Heading>{item.name}</Heading><Label muted>{statusName(item.status, t)}</Label><Button title={t('Управлять', 'Manage')} variant="secondary" onPress={() => navigate(route.name, { tournamentId: item.id })} /></Card>)}
    {pager}{footer}
  </Screen>;

  let content: React.ReactNode;
  if (route.name === 'organizer') {
    const entries = [
      ['org-edit', t('Настройки турнира', 'Tournament settings')], ['org-registrations', t('Участники и оплата', 'Registrations & payment')],
      ['org-rounds', t('Раунды и результаты', 'Rounds & results')], ['org-tables', t('Столы и миссии', 'Tables & missions')],
      ['org-seeds', t('Посев', 'Seeding')], ['org-staff', t('Сотрудники и доступ', 'Staff & access')], ['org-audit', t('История изменений', 'Audit history')],
    ];
    content = <><Card><Heading>{tournament.name}</Heading><Badge>{statusName(tournament.status, t)}</Badge><Label>{`${t('Участников', 'Entries')}: ${team ? rosters.length : participants.length} · ${t('Раундов', 'Rounds')}: ${rounds.length}`}</Label></Card>
      <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: 12 }}>{entries.map(([name, label]) => <View style={{ flexBasis: wide ? '47%' : 'auto', flexGrow: 1 }} key={name}><Button title={label} variant="secondary" onPress={() => go(name)} /></View>)}</View>
      <Button title={t('Публичная страница', 'Public tournament')} variant="secondary" onPress={() => navigate('tournament', { slug: tournament.slug, tournamentId })} />
      <Button title={t('Экспорт результатов · XLSX', 'Export results · XLSX')} variant="secondary" disabled={busy} onPress={() => void run(async () => {
        const file = await api.download(`${base}/export.xlsx`);
        const filename = `tournament-${tournamentId}-results.xlsx`;
        if (Platform.OS === 'web') {
          const web = globalThis as any;
          const url = web.URL.createObjectURL(new web.Blob([file.bytes], { type: file.contentType }));
          const link = web.document.createElement('a'); link.href = url; link.download = filename; link.click();
          setTimeout(() => web.URL.revokeObjectURL(url), 60000);
        } else {
          const { File, Paths } = await import('expo-file-system');
          const sharing = await import('expo-sharing');
          if (!await sharing.isAvailableAsync()) throw new Error(t('Общий доступ к файлам недоступен на устройстве', 'File sharing is unavailable on this device'));
          const local = new File(Paths.cache, filename);
          local.write(file.bytes);
          try { await sharing.shareAsync(local.uri, { mimeType: file.contentType, UTI: 'org.openxmlformats.spreadsheetml.sheet' }); }
          finally { if (local.exists) local.delete(); }
        }
      }, () => setNotice(t('Экспорт подготовлен', 'Export prepared')))} />
      {tournament.status === 'draft' && <Button title={t('Опубликовать и открыть регистрацию', 'Publish & open registration')} disabled={busy} onPress={() => mutate(t('Опубликовать турнир?', 'Publish this tournament?'), `${base}/publish`, 'POST', { status: 'registration_open' })} />}
      {['registration_open', 'registration_closed'].includes(tournament.status) && <Button title={tournament.status === 'registration_open' ? t('Закрыть регистрацию', 'Close registration') : t('Открыть регистрацию', 'Reopen registration')} disabled={busy} onPress={() => mutate(t('Изменить регистрацию?', 'Change registration status?'), `${base}/registration/${tournament.status === 'registration_open' ? 'close' : 'reopen'}`)} />}
      {tournament.status === 'draft' && <Button title={t('Удалить черновик', 'Delete draft')} variant="danger" disabled={busy} onPress={() => mutate(t('Удалить турнир и его данные? Это действие нельзя отменить.', 'Delete this tournament and its data? This cannot be undone.'), base, 'DELETE', {}, () => navigate('organizer'))} />}
    </>;
  } else if (route.name === 'org-create' || route.name === 'org-edit') {
    content = <TournamentForm key={tournament.updatedAt || 'new'} initial={route.name === 'org-edit' ? tournament : {}} busy={busy} creating={route.name === 'org-create'} onSave={body => mutate(t('Сохранить настройки турнира?', 'Save tournament settings?'), base || '/api/admin/tournaments', base ? 'PATCH' : 'POST', body, value => navigate('organizer', { tournamentId: value.tournament.id }))} />;
  } else if (route.name === 'org-registrations') {
    const entries = team ? rosters : participants;
    content = <><Label muted>{t('Отметка оплаты — только учёт взноса, деньги не списываются.', 'Payment marks record fees; no money is charged.')}</Label>
      {!entries.length && <Card><Label>{t('Заявок пока нет', 'No registrations yet')}</Label></Card>}
      {entries.map(p => <Card key={p.id}><Heading>{participantName(p)}</Heading><Label muted>{statusName(p.status, t)} · {p.faction || ''}</Label><Badge>{p.paid ? t('Оплачено', 'Paid') : t('Не оплачено', 'Unpaid')}</Badge>
        <Button title={p.paid ? t('Снять отметку оплаты', 'Mark unpaid') : t('Отметить оплату', 'Mark paid')} variant="secondary" disabled={busy} onPress={() => mutate(t('Изменить отметку оплаты?', 'Change payment mark?'), `${base}/${team ? 'rosters' : 'participants'}/${id(p.id)}/payment`, 'PATCH', { paid: !p.paid })} />
        {!team && editable && <Button title={t('Удалить участника', 'Remove participant')} variant="danger" disabled={busy} onPress={() => mutate(t('Удалить участника? Сервер проверит влияние на текущие игры.', 'Remove this participant? The server will check affected games.'), `${base}/participants/${id(p.id)}`, 'DELETE', { expectedIdentity: { userId: p.userId ?? null, displayName: p.displayName, isProxy: Boolean(p.isProxy) } })} />}
      </Card>)}
      {!team && editable && <Card><Heading>{t('Добавить участника', 'Add participant')}</Heading><TextField label={t('Имя', 'Name')} value={form.name || ''} onChangeText={change('name')} /><TextField label={t('Фракция', 'Faction')} value={form.faction || ''} onChangeText={change('faction')} /><TextField label={t('ID аккаунта (если есть)', 'Account ID (optional)')} value={form.userId || ''} onChangeText={change('userId')} keyboardType="number-pad" /><Button title={t('Добавить', 'Add')} disabled={busy || !form.name?.trim()} onPress={() => mutate(t('Добавить участника?', 'Add participant?'), `${base}/participants`, 'POST', { displayName: form.name.trim(), faction: form.faction || '', ...(form.userId ? { userId: Number(form.userId) } : {}) })} /></Card>}
      {team && editable && <Button title={t('Зарегистрировать состав', 'Register roster')} variant="secondary" onPress={() => navigate('roster-registration', { tournamentId, slug: tournament.slug })} />}
    </>;
  } else if (route.name === 'org-rounds') {
    const last = rounds[rounds.length - 1];
    content = <>
      {rounds.map(round => <Card key={round.id}><Heading>{t('Раунд', 'Round')} {round.roundNumber}</Heading><Badge>{statusName(round.status, t)}</Badge>
        {list(round.matches).map(match => <View key={match.id} style={{ gap: 8, paddingVertical: 8 }}><Label>{participantName(team ? match.rosterA : match.participantA)} — {match.isBye || match.resolution === 'bye' ? 'BYE' : participantName(team ? match.rosterB : match.participantB)}</Label><Label muted>{statusName(match.status || match.phase, t)}</Label>{!team && !match.isBye && ['active', 'pending_confirmation', 'completed'].includes(match.status) && <Button title={t('Результат', 'Result')} variant="secondary" onPress={() => go('org-result', { matchId: match.id })} />}{team && <Button title={t('Открыть пейринг', 'Open pairing')} variant="secondary" onPress={() => navigate('pairing', { tournamentId, id: match.id, matchId: match.id, slug: tournament.slug })} />}</View>)}
        {!team && round.status === 'active' && <Button title={t('Редактировать пары', 'Edit pairings')} variant="secondary" onPress={() => go('org-pairings', { roundId: round.id })} />}
        {team && <Button title={t('Столы раунда', 'Round tables')} variant="secondary" onPress={() => go('org-round-tables', { roundId: round.id })} />}
      </Card>)}
      {team && list(data?.tournamentGames).map(game => <Card key={game.id}><Heading>{list(game.players).map(participantName).join(' — ')}</Heading><Badge>{statusName(game.status, t)}</Badge><Button title={t('Исправить результат', 'Correct result')} variant="secondary" onPress={() => go('org-team-result', { gameId: game.id })} /></Card>)}
      {['registration_closed', 'in_progress'].includes(tournament.status) && <Button title={t('Предпросмотр следующего раунда', 'Preview next round')} disabled={busy} onPress={() => void run(() => api.request(`${base}/rounds/next/preview`), value => { setPreview(value); setNotice(''); })} />}
      {!!preview && <Card><Heading>{t('Предпросмотр', 'Preview')}</Heading><Label>{t('Проверьте пары, BYE и назначения перед сохранением.', 'Review pairings, BYEs and assignments before saving.')}</Label>
        {list(preview.round?.matches || preview.round?.pairings || preview.pairings).map((match, index) => <Label key={match.id || index}>{participantName(match.participantA || match.rosterA || rosters.find(r => r.id === match.rosterAId))} — {match.isBye || !match.participantBId && !match.rosterBId ? 'BYE' : participantName(match.participantB || match.rosterB || rosters.find(r => r.id === match.rosterBId))}</Label>)}
        <TextField label={t('Окончание раунда (ISO с часовым поясом, необязательно)', 'Round deadline (ISO with timezone, optional)')} value={preview.round?.endsAt || ''} onChangeText={value => setPreview({ ...preview, round: { ...preview.round, endsAt: value } })} />
        {!team && <Choice label={t('Миссия раунда', 'Round mission')} value={preview.round?.mission?.critOp || ''} options={reference.critOpOptions} onChange={value => setPreview({ ...preview, round: { ...preview.round, mission: { ...preview.round?.mission, critOp: value } } })} />}
        {team && list(preview.tables).map((table, tableIndex) => <Card key={table.id || tableIndex}><Heading>{t('Стол', 'Table')} {table.tableNumber}</Heading><Choice label="Killzone" value={table.killzone || ''} options={reference.killzoneOptions} onChange={value => setPreview({ ...preview, tables: preview.tables.map((item: Data, i: number) => i === tableIndex ? { ...item, killzone: value } : item) })} /><TextField label={t('Схема', 'Deployment')} keyboardType="number-pad" value={String(table.deployment || '')} onChangeText={value => setPreview({ ...preview, tables: preview.tables.map((item: Data, i: number) => i === tableIndex ? { ...item, deployment: Number(value) } : item) })} /></Card>)}
        <Button variant="primary" title={t('Сформировать раунд', 'Generate round')} disabled={busy || !!preview.round?.endsAt && !Number.isFinite(Date.parse(preview.round.endsAt))} onPress={() => mutate(t('Сформировать раунд с этими парами?', 'Generate a round with these pairings?'), `${base}/rounds/next`, 'POST', roundPayload(preview, team), () => { setPreview(null); void load(); })} />
      </Card>}
      {tournament.status === 'registration_closed' && !!last && <Button title={t('Начать турнир', 'Start tournament')} disabled={busy} onPress={() => mutate(t('Активировать подготовленный первый раунд?', 'Activate the prepared first round?'), `${base}/start`)} />}
      {!!last && editable && <Button title={t('Откатить последний раунд', 'Roll back latest round')} variant="danger" disabled={busy} onPress={() => mutate(t('Откат удалит несигранные игры последнего раунда. Сервер запретит откат, если результат уже отправлен.', 'Rollback removes unplayed games in the latest round. The server refuses rollback if a result has already been submitted.'), `${base}/rounds/latest`, 'DELETE', { roundId: last.id })} />}
      {tournament.status === 'in_progress' && <Button title={t('Опубликовать итоговую таблицу', 'Publish final standings')} disabled={busy} onPress={() => mutate(t('Завершить турнир и опубликовать текущий порядок итоговой таблицы?', 'Complete the tournament and publish the current final standings order?'), `${base}/standings/publish`, 'POST', team ? {} : { participantIds: list(data?.standings).map(row => row.participantId) })} />}
    </>;
  } else if (route.name === 'org-tables') {
    content = <><Label muted>{t('Изменения применяются к настройкам столов турнира. История сыгранных раундов сохраняется.', 'Changes affect tournament table settings. Played-round history is preserved.')}</Label>
      {team && tournament.teamTablesLocked && <Label>{t('Столы закреплены за раундами. Редактируйте их в разделе «Раунды → Столы раунда».', 'Tables are locked to rounds. Edit them under Rounds → Round tables.')}</Label>}
      {list(data?.tables).map(table => <TableEditor key={`${table.id}-${table.updatedAt}`} table={table} disabled={busy || !editable || team && tournament.teamTablesLocked} onSave={body => mutate(t('Сохранить стол?', 'Save table?'), `${base}/tables/${id(table.id)}`, 'PATCH', body)} onDelete={() => mutate(t('Удалить стол?', 'Delete table?'), `${base}/tables/${id(table.id)}`, 'DELETE')} />)}
      {editable && !(team && tournament.teamTablesLocked) && <TableEditor table={{}} disabled={busy} onSave={body => mutate(t('Добавить стол?', 'Add table?'), `${base}/tables`, 'POST', body)} />}
    </>;
  } else if (route.name === 'org-result') {
    const match = matches.find(m => m.id === Number(params.matchId));
    content = match ? <ResultEditor key={match.id} match={match} disabled={busy || !editable} onSave={body => mutate(t('Сохранить результат от имени организатора? Изменение будет записано в аудит.', 'Save the result as organizer? The change is recorded in the audit history.'), `${base}/matches/${id(match.id)}/result`, 'PATCH', body)} />
      : <><Label>{t('Выберите игру', 'Choose a game')}</Label>{matches.filter(m => !m.isBye).map(match => <Button key={match.id} title={`${participantName(match.participantA)} — ${participantName(match.participantB)}`} variant="secondary" onPress={() => go('org-result', { matchId: match.id })} />)}</>;
  } else if (route.name === 'org-team-result') {
    const game = list(data?.tournamentGames).find(g => g.id === Number(params.gameId));
    const players = list(game?.players).map(p => ({ ...p, resultKey: p.resultKey ?? p.id, displayName: p.name }));
    content = game && players.length === 2 ? <ResultEditor key={game.id} match={{ ...game, participantA: players[0], participantB: players[1], mission: game.teamTournamentGame?.mission || game.result?.killzone || game.mission }} disabled={busy || tournament.status === 'cancelled'} onSave={body => mutate(t('Сохранить результат командной игры? Сервер проверит доступ и зависимые раунды.', 'Save this team game result? The server checks permissions and dependent rounds.'), `/api/admin/games/${id(game.id)}/result`, 'PATCH', body)} /> : <Label>{t('Игра не найдена в турнире', 'Game not found in this tournament')}</Label>;
  } else if (route.name === 'org-staff') {
    const staff = data?.staff || {};
    content = <>{list(staff.staff).map(person => <Card key={person.userId}><Heading>{person.name}</Heading><Badge>{statusName(person.role, t)}</Badge><Label muted>{person.active ? t('Доступ активен', 'Access active') : t('Доступ завершён', 'Access inactive')}{person.expiresAt ? ` · ${new Date(person.expiresAt).toLocaleString()}` : ''}</Label>{person.canRevoke && <Button title={t('Снять назначение', 'Revoke assignment')} variant="danger" disabled={busy} onPress={() => mutate(t('Отозвать доступ судьи к этому турниру?', 'Revoke this judge’s tournament access?'), `${base}/judges/${id(person.userId)}`, 'DELETE')} />}</Card>)}
      {staff.canManageJudges && <Card><Heading>{t('Назначить судью', 'Assign judge')}</Heading><TextField label={t('Найти игрока', 'Find player')} value={form.search || ''} onChangeText={change('search')} /><Button title={t('Найти', 'Search')} variant="secondary" disabled={busy || !(form.search?.trim().length >= 2)} onPress={() => void run(() => api.request(`/api/users/search?q=${encodeURIComponent(form.search.trim())}`), value => { setUsers(list(value.users || value)); setNotice(''); })} />{users.map(person => <Button key={person.id} title={person.name} variant={Number(form.userId) === person.id ? 'primary' : 'secondary'} onPress={() => field('userId', person.id)} />)}
        <TextField label={t('Доступ до (ISO, необязательно)', 'Expires at (ISO, optional)')} value={form.expiresAt || ''} onChangeText={change('expiresAt')} placeholder="2026-12-31T18:00:00+03:00" />
        <Button title={t('Назначить', 'Assign')} disabled={busy || !form.userId || !!form.expiresAt && !Number.isFinite(Date.parse(form.expiresAt))} onPress={() => mutate(t('Выдать доступ к управлению турниром?', 'Grant tournament management access?'), `${base}/judges`, 'POST', { userId: Number(form.userId), expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null })} /></Card>}
      {user.isSuperAdmin && <Card><Heading>{t('Передать владение', 'Transfer ownership')}</Heading><TextField label={t('ID нового организатора', 'New organizer account ID')} value={form.owner || ''} onChangeText={change('owner')} keyboardType="number-pad" /><TextField label={t('Причина', 'Reason')} value={form.reason || ''} onChangeText={change('reason')} /><Button title={t('Передать турнир', 'Transfer tournament')} variant="danger" disabled={busy || !Number(form.owner) || !form.reason?.trim()} onPress={() => mutate(t('Передать полный контроль новому организатору?', 'Transfer full control to the new organizer?'), `${base}/owner`, 'PATCH', { userId: Number(form.owner), reason: form.reason.trim() })} /></Card>}
    </>;
  } else if (route.name === 'org-audit') {
    content = <>{!list(data?.events).length && <Label>{t('Записей пока нет', 'No entries yet')}</Label>}{list(data?.events).map(event => <Card key={event.id}><Heading>{event.eventType}</Heading><Label muted>{new Date(event.createdAt).toLocaleString()} · {event.actorName || `#${event.actorUserId}`}</Label><Label>{t('Объект', 'Entity')}: {event.entityType || '—'} #{event.entityId || '—'}</Label><Label size={12}>{JSON.stringify({ before: event.before, after: event.after, metadata: event.metadata }, null, 2)}</Label></Card>)}{pager}</>;
  } else if (route.name === 'org-pairings') {
    content = <PairingEditor key={data?.revision} data={data || {}} disabled={busy} onSave={body => mutate(t('Пересобрать активные пары? Незавершённые связанные игры могут быть пересозданы.', 'Replace active pairings? Linked unplayed games may be recreated.'), pathname, 'PATCH', body)} />;
  } else if (route.name === 'org-round-tables') {
    content = <RoundTablesEditor key={data?.round?.updatedAt} data={data || {}} disabled={busy} onSave={body => mutate(t('Обновить столы выбранного раунда? Выборы капитанов сохранятся.', 'Update tables for this round? Captain selections are preserved.'), pathname, 'PATCH', body)} />;
  } else if (route.name === 'org-seeds') {
    content = <SeedEditor entries={team ? rosters : participants} disabled={busy || !editable} onSave={ids => mutate(t('Сохранить порядок посева?', 'Save seeding order?'), `${base}/${team ? 'rosters/seeds' : 'seeds'}`, 'POST', team ? { rosterIds: ids } : { participantIds: ids })} />;
  } else content = <Label>{t('Раздел не найден', 'Section not found')}</Label>;

  return <Screen title={titleMap[route.name] || titleMap.organizer}>{route.name !== 'organizer' && base && <Button title={t('К турниру', 'Tournament dashboard')} variant="secondary" onPress={() => go('organizer')} />}{content}{footer}</Screen>;
}

function statusName(value: string, t: (ru: string, en: string) => string) {
  const names: Record<string, [string, string]> = { draft: ['Черновик', 'Draft'], registration_open: ['Регистрация открыта', 'Registration open'], registration_closed: ['Регистрация закрыта', 'Registration closed'], in_progress: ['Идёт турнир', 'In progress'], completed: ['Завершён', 'Completed'], cancelled: ['Отменён', 'Cancelled'], active: ['Активен', 'Active'], joined: ['Зарегистрирован', 'Registered'], pending_confirmation: ['Ожидает подтверждения', 'Awaiting confirmation'], pending_placement: ['Ожидает размещения', 'Awaiting placement'], withdrawn: ['Снят', 'Withdrawn'], removed: ['Удалён', 'Removed'], not_ready: ['Подготовлен', 'Prepared'], judge: ['Судья', 'Judge'], organizer: ['Организатор', 'Organizer'], super_admin: ['Суперадминистратор', 'Super administrator'] };
  return names[value] ? t(...names[value]) : value || '—';
}

function TournamentForm({ initial, creating, busy, onSave }: { initial: Data; creating: boolean; busy: boolean; onSave: (body: Data) => void }) {
  const { t } = useDesign();
  const [form, setForm] = useState<Data>({ name: '', description: '', startsAt: '', format: 'swiss', participantMode: 'individual', venueMode: 'irl', swissRoundCount: 3, singleEliminationSize: 8, pairingType: 'shield_sword', registrationLimit: '', factionCount: 1, ratingPolicy: 'ranked', ...initial });
  const set = (key: string) => (value: any) => setForm(f => ({ ...f, [key]: value }));
  const options = (key: string, values: [string, string][]) => <Row>{values.map(([value, label]) => <Button key={value} title={label} variant={String(form[key]) === value ? 'primary' : 'secondary'} disabled={busy} onPress={() => set(key)(value)} />)}</Row>;
  const team = form.participantMode === 'team';
  const locked = !creating && ['completed', 'cancelled', 'in_progress'].includes(initial.status);
  return <><Card><TextField label={t('Название турнира', 'Tournament name')} value={form.name} onChangeText={set('name')} /><TextField label={t('Описание / правила', 'Description / rules')} multiline value={form.description || ''} onChangeText={set('description')} /><TextField label={t('Дата и время с часовым поясом', 'Start date & time with timezone')} value={form.startsAt || ''} onChangeText={set('startsAt')} placeholder="2026-12-01T10:00:00+03:00" /><TextField label={t('Ссылка на правила', 'Rules URL')} value={form.rulesLink || ''} onChangeText={set('rulesLink')} autoCapitalize="none" /></Card>
    <Card><Heading>{t('Формат', 'Format')}</Heading>{options('participantMode', [['individual', t('Личный', 'Individual')], ['team', t('Командный', 'Team')]])}{!team && options('format', [['swiss', t('Швейцарская', 'Swiss')], ['single_elimination', t('На вылет', 'Single elimination')]])}{(team || form.format === 'swiss') ? <TextField label={t('Количество раундов', 'Round count')} value={String(form.swissRoundCount)} onChangeText={set('swissRoundCount')} keyboardType="number-pad" /> : options('singleEliminationSize', [8, 16, 32, 64].map(n => [String(n), String(n)]))}
      {team && options('pairingType', [['shield_sword', 'WTC'], ['sword_shield_classic', 'Sword Shield Classic'], ['doubles', 'Doubles']])}
      <TextField label={t('Лимит регистрации (пусто — без лимита)', 'Registration limit (empty for unlimited)')} value={String(form.registrationLimit || '')} onChangeText={set('registrationLimit')} keyboardType="number-pad" /><TextField label={t('Количество фракций', 'Faction count')} value={String(form.factionCount)} onChangeText={set('factionCount')} keyboardType="number-pad" />
      {options('ratingPolicy', [['ranked', t('Рейтинговый', 'Ranked')], ['unranked', t('Без рейтинга', 'Unranked')]])}
    </Card><Card><Heading>{t('Площадка', 'Venue')}</Heading>{options('venueMode', [['irl', 'IRL'], ['tts', 'TTS']])}{form.venueMode === 'irl' && <TextField label={t('Адрес', 'Address')} value={form.venueAddress || ''} onChangeText={set('venueAddress')} />}</Card>
    {locked && <Label>{t('Изменения структуры доступны до начала турнира.', 'Tournament structure can be changed before the event starts.')}</Label>}
    <Button variant="primary" title={creating ? t('Создать черновик', 'Create draft') : t('Сохранить', 'Save')} disabled={busy || locked || !form.name.trim() || !!form.startsAt && !Number.isFinite(Date.parse(form.startsAt))} onPress={() => onSave({ name: form.name.trim(), description: form.description, startsAt: form.startsAt || null, ...((form.rulesLink || '') !== (initial.rulesLink || '') ? { rulesLink: form.rulesLink || '' } : {}), participantMode: form.participantMode, format: team ? 'swiss' : form.format, venueMode: team && form.pairingType === 'doubles' ? 'irl' : form.venueMode, venueAddress: form.venueAddress || '', swissRoundCount: team || form.format === 'swiss' ? Number(form.swissRoundCount) : null, singleEliminationSize: !team && form.format === 'single_elimination' ? Number(form.singleEliminationSize) : null, registrationLimit: form.registrationLimit ? Number(form.registrationLimit) : null, factionCount: Number(form.factionCount), ratingPolicy: form.ratingPolicy, ...(team ? { teamSize: form.pairingType === 'doubles' ? 2 : 3, pairingType: form.pairingType, captainPairingEnabled: form.pairingType !== 'doubles' } : {}), ...(!creating ? { expectedUpdatedAt: initial.updatedAt } : {}) })} />
  </>;
}

function TableEditor({ table, disabled, onSave, onDelete }: { table: Data; disabled: boolean; onSave: (body: Data) => void; onDelete?: () => void }) {
  const { t } = useDesign();
  const [number, setNumber] = useState(String(table.tableNumber || ''));
  const [killzone, setKillzone] = useState(table.killzone || '');
  const [deployment, setDeployment] = useState(String(table.deployment || ''));
  return <Card><Heading>{table.id ? `${t('Стол', 'Table')} ${table.tableNumber}` : t('Новый стол', 'New table')}</Heading><TextField label={t('Номер', 'Number')} value={number} onChangeText={setNumber} keyboardType="number-pad" /><Choice label="Killzone" value={killzone} options={reference.killzoneOptions} onChange={setKillzone} disabled={disabled} /><TextField label={t('Схема расстановки', 'Deployment layout')} value={deployment} onChangeText={setDeployment} keyboardType="number-pad" /><Row><Button variant="primary" title={t('Сохранить', 'Save')} disabled={disabled || !Number.isInteger(Number(number)) || Number(number) < 1} onPress={() => onSave({ tableNumber: Number(number), killzone, deployment: deployment ? Number(deployment) : null })} />{onDelete && <Button title={t('Удалить', 'Delete')} variant="danger" disabled={disabled} onPress={onDelete} />}</Row></Card>;
}

function ResultEditor({ match, disabled, onSave }: { match: Data; disabled: boolean; onSave: (body: Data) => void }) {
  const { t } = useDesign();
  const players = [match.participantA, match.participantB];
  const [scores, setScores] = useState<Data>(() => Object.fromEntries(players.filter(Boolean).map(p => { const key = resultKey(p); return [key, { crit: '0', kill: '0', tac: '0', primary: 'crit', faction: p.faction || '', ...(match.pendingResult?.result?.scores?.[key] || match.result?.scores?.[key] || match.result?.scoresByParticipant?.[p.id] || {}) }]; })));
  const [tie, setTie] = useState(false);
  const [apl, setApl] = useState<Data>({});
  const [winner, setWinner] = useState<number | null>(null);
  const [ack, setAck] = useState(false);
  const valid = players.every(p => p && ['crit', 'kill', 'tac'].every(k => Number.isInteger(Number(scores[resultKey(p)]?.[k])) && Number(scores[resultKey(p)]?.[k]) >= 0 && Number(scores[resultKey(p)]?.[k]) <= 6));
  if (players.some(p => !p)) return <Card><Label>{t('Оба участника должны быть назначены', 'Both players must be assigned')}</Label></Card>;
  return <><Label muted>{t('Организатор сохраняет результат без подтверждения соперника. Сервер проверяет возможность исправления и записывает изменения в аудит.', 'Organizer results do not need opponent confirmation. The server checks whether the result is editable and records changes in the audit history.')}</Label>{players.map(p => {
    const key = resultKey(p); const score = scores[key];
    return <Card key={key}><Heading>{participantName(p)}</Heading>{['crit', 'kill', 'tac'].map(k => <TextField key={k} label={`${k.toUpperCase()} (0–6)`} value={String(score[k])} keyboardType="number-pad" onChangeText={value => { setAck(false); setScores(old => ({ ...old, [key]: { ...old[key], [k]: value } })); }} />)}<Label>{t('Основная операция', 'Primary operation')}</Label><Row>{['crit', 'kill', 'tac'].map(k => <Button key={k} title={k.toUpperCase()} variant={score.primary === k ? 'primary' : 'secondary'} onPress={() => { setAck(false); setScores(old => ({ ...old, [key]: { ...old[key], primary: k } })); }} />)}</Row><TextField label={t('Фракция', 'Faction')} value={score.faction} onChangeText={value => setScores(old => ({ ...old, [key]: { ...old[key], faction: value } }))} /><Heading>{t('Итого', 'Total')}: {Number(score.crit) + Number(score.kill) + Number(score.tac) + Math.ceil(Number(score[score.primary]) / 2)}</Heading></Card>;
  })}<Button title={tie ? t('Тайбрейкер включён', 'Tiebreaker enabled') : t('Включить тайбрейкер', 'Enable tiebreaker')} variant="secondary" onPress={() => { setTie(!tie); setAck(false); }} />{tie && <Card>{players.map(p => <TextField key={p.id} label={`${participantName(p)} · APL`} value={String(apl[resultKey(p)] || '')} onChangeText={value => setApl(old => ({ ...old, [resultKey(p)]: value }))} keyboardType="number-pad" />)}<Label>{t('Победитель броска при полном равенстве', 'Roll-off winner if all other values tie')}</Label><Row>{players.map(p => <Button key={p.id} title={participantName(p)} variant={winner === resultKey(p) ? 'primary' : 'secondary'} onPress={() => setWinner(resultKey(p))} />)}</Row></Card>}
    <Button title={ack ? t('Результат проверен', 'Result reviewed') : t('Я проверил результат', 'I reviewed the result')} variant="secondary" onPress={() => setAck(!ack)} />
    <Button title={t('Сохранить результат', 'Save result')} variant="primary" disabled={disabled || !valid || !ack} onPress={() => onSave({ scores, killzone: match.mission || null, tiebreakers: { enabled: tie, apl: Object.fromEntries(players.map(p => [resultKey(p), Number(apl[resultKey(p)] || 0)])), rollOffWinnerId: winner } })} />
  </>;
}

function SeedEditor({ entries, disabled, onSave }: { entries: Data[]; disabled: boolean; onSave: (ids: number[]) => void }) {
  const { t } = useDesign();
  const [order, setOrder] = useState(() => entries.filter(p => ['joined', 'active', 'registered'].includes(p.status) || !p.status).sort((a, b) => (a.seed || 9999) - (b.seed || 9999)));
  const move = (index: number, delta: number) => setOrder(old => { const next = [...old]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  return <>{order.map((p, index) => <Card key={p.id}><Heading>{index + 1}. {participantName(p)}</Heading><Row><Button title={t('Выше', 'Move up')} variant="secondary" disabled={disabled || index === 0} onPress={() => move(index, -1)} /><Button title={t('Ниже', 'Move down')} variant="secondary" disabled={disabled || index === order.length - 1} onPress={() => move(index, 1)} /></Row></Card>)}<Button variant="primary" title={t('Сохранить посев', 'Save seeds')} disabled={disabled || !order.length} onPress={() => onSave(order.map(p => p.id))} /></>;
}

function PairingEditor({ data, disabled, onSave }: { data: Data; disabled: boolean; onSave: (body: Data) => void }) {
  const { t } = useDesign();
  const [pairs, setPairs] = useState<Data[]>(() => list(data.round?.matches).map(m => ({ matchId: m.id, participantAId: m.participantAId, participantBId: m.participantBId, tableId: m.tableId })));
  const [choosing, setChoosing] = useState<{ index: number; side: string } | null>(null);
  const player = (participantId: any) => participantName(list(data.participants).find(p => p.id === participantId));
  const update = (index: number, key: string, value: any) => setPairs(old => old.map((p, i) => i === index ? { ...p, [key]: value } : p));
  return <><Label muted>{t('Завершённые игры заблокированы и сохраняются. Каждый доступный игрок должен входить ровно в одну пару.', 'Completed games stay locked. Every available player must be assigned exactly once.')}</Label>{list(data.lockedMatches).map(match => <Card key={match.id}><Badge>{t('Заблокировано', 'Locked')}</Badge><Label>{participantName(match.participantA)} — {participantName(match.participantB)}</Label></Card>)}{pairs.map((pair, index) => <Card key={pair.matchId || index}><Heading>{t('Пара', 'Pair')} {index + 1}</Heading>{['participantAId', 'participantBId'].map(side => <Button key={side} title={player(pair[side])} variant="secondary" onPress={() => setChoosing({ index, side })} />)}<Label>{t('Стол', 'Table')}</Label><Row>{list(data.tables).map(table => <Button key={table.id} title={String(table.tableNumber)} variant={pair.tableId === table.id ? 'primary' : 'secondary'} onPress={() => update(index, 'tableId', table.id)} />)}</Row></Card>)}
    {!!choosing && <Card><Heading>{t('Выберите игрока', 'Choose a player')}</Heading>{list(data.participants).map(p => <Button key={p.id} title={participantName(p)} variant="secondary" onPress={() => { update(choosing.index, choosing.side, p.id); setChoosing(null); }} />)}<Button title={t('Нет участника', 'No participant')} variant="secondary" onPress={() => { update(choosing.index, choosing.side, null); setChoosing(null); }} /><Button title={t('Закрыть', 'Close')} variant="secondary" onPress={() => setChoosing(null)} /></Card>}
    <Button variant="primary" title={t('Сохранить пары', 'Save pairings')} disabled={disabled || !!choosing} onPress={() => onSave({ matchups: pairs, expectedRevision: data.revision })} /></>;
}

function roundPayload(preview: Data, team: boolean) {
  const round = preview.round || preview;
  const pairings = list(team ? round.matches || round.pairings || preview.pairings : round.matches);
  return { reviewPairingWarnings: true, ...(round.mission ? { mission: round.mission } : {}), endsAt: round.endsAt || null, ...(team ? { tables: list(preview.tables).map(table => ({ ...(table.id ? { id: table.id } : {}), tableNumber: table.tableNumber, killzone: table.killzone, deployment: table.deployment, imageId: table.imageId })), missions: round.missions } : {}), ...(pairings.length ? { matchups: pairings.map(m => team ? { rosterAId: m.rosterAId, rosterBId: m.rosterBId, lineNumber: m.lineNumber } : { participantAId: m.participantAId, participantBId: m.participantBId, tableId: m.tableId }) } : {}) };
}

function RoundTablesEditor({ data, disabled, onSave }: { data: Data; disabled: boolean; onSave: (body: Data) => void }) {
  const { t } = useDesign();
  const [tables, setTables] = useState(() => list(data.tables).map(table => ({ id: table.id, tableNumber: table.tableNumber, killzone: table.killzone, deployment: table.deployment, imageId: table.imageId })));
  const change = (index: number, key: string, value: any) => setTables(old => old.map((table, i) => i === index ? { ...table, [key]: value } : table));
  return <><Label muted>{t('Изменяется только этот раунд. Сохранение проверяет, что другой организатор не изменил его параллельно.', 'Only this round is changed. Saving checks for concurrent edits by another organizer.')}</Label>{tables.map((table, index) => <Card key={table.id}><Heading>{t('Стол', 'Table')} {table.tableNumber}</Heading><Choice label="Killzone" value={table.killzone} options={reference.killzoneOptions} disabled={disabled} onChange={value => change(index, 'killzone', value)} /><TextField label={t('Схема', 'Deployment')} keyboardType="number-pad" value={String(table.deployment || '')} onChangeText={value => change(index, 'deployment', Number(value))} /></Card>)}<Button variant="primary" title={t('Сохранить столы раунда', 'Save round tables')} disabled={disabled || !tables.length} onPress={() => onSave({ tables, expectedUpdatedAt: data.round?.updatedAt })} /></>;
}
