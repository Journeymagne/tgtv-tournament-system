import React from 'react';
import Model from 'src/Model';
import {hydrate, pack} from 'src/simulation/model';
import {Mode} from 'src/simulation/types';
import {
  hasLegacy, importBrowserProfiles, Library, listProfiles, notifyProfiles, ProfileRequestError,
  profilesChanged, requestProfiles, SavedProfile, sessionChanged,
} from './weaponProfileLibrary';

interface Props { mode: Mode; model: Model; onChange: (model: Model) => void; idPrefix: string; }
type State = Library | 'loading' | 'guest' | 'error';
type Session = {user: {id: number} | null};
const shell = () => (window as Window & {KTCompanion?: {ready: Promise<Session>; loginUrl(): string}}).KTCompanion;
const buttonClass = 'lab-button lab-button-secondary lab-button-small';
const limitMessage = 'Можно сохранить до 100 профилей на режим. Удалите лишние профили и повторите.';

function useLibrary(mode: Mode) {
  const [state, setState] = React.useState<State>('loading');
  const retry = React.useRef(() => {});
  React.useEffect(() => {
    let version = 0;
    let account: number | null | undefined;
    async function load(expected?: number) {
      const request = ++version;
      try {
        const next = await listProfiles(mode, expected);
        if (request !== version) return;
        account = next.accountId;
        setState(next);
      } catch (error) {
        if (request !== version) return;
        if (error instanceof ProfileRequestError && error.status === 401) {
          account = null;
          setState('guest');
          if (expected !== undefined) void load(); // Discover the new account after a cookie change.
        } else {
          setState('error');
        }
      }
    }
    function session({user}: Session) {
      const id = user?.id ?? null;
      if (id !== null && account === id) return;
      ++version;
      account = id;
      if (id === null) setState('guest');
      else { setState('loading'); void load(id); }
    }
    function reset() {
      account = undefined;
      setState('loading');
      void load();
    }
    const onSession = (event: Event) => session((event as CustomEvent<Session>).detail);
    const refresh = () => { if (account != null) void load(account); };
    const onChange = (event: Event) => { if ((event as CustomEvent<Mode>).detail === mode) refresh(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'kt-companion-session-change') reset();
      else if (event.key === profilesChanged || event.key === 'companion-weapon-profiles-' + mode) refresh();
    };
    window.addEventListener('kt:session', onSession);
    window.addEventListener(sessionChanged, reset);
    window.addEventListener(profilesChanged, onChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    retry.current = reset;

    const ready = shell()?.ready;
    if (ready) {
      ready.then(initial => { if (!version) session(initial); })
        .catch(() => { if (!version) reset(); });
    } else if (document.body.dataset.companionSection === 'combat') reset();
    else setState('guest'); // Standalone calculator with no Companion account service.
    return () => {
      ++version;
      window.removeEventListener('kt:session', onSession);
      window.removeEventListener(sessionChanged, reset);
      window.removeEventListener(profilesChanged, onChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
    };
  }, [mode]);
  return {state, retry: () => retry.current()};
}

function AccountProfiles({library, mode, model, onChange, idPrefix}: Props & {library: Library}) {
  const {accountId, profiles} = library;
  const [selected, setSelected] = React.useState('');
  const [name, setName] = React.useState('');
  const [form, setForm] = React.useState<'save' | 'delete' | null>(null);
  const [deleteRevision, setDeleteRevision] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const current = profiles.find(row => row.name === selected);

  function select(profile?: SavedProfile) {
    setForm(null);
    setSelected(profile?.name || '');
    if (!profile) { setStatus(''); return; }
    const restored = hydrate(profile.model);
    // An equipped weapon must preserve the fighter's current and printed health and defences.
    restored.wounds = model.wounds;
    restored.woundsStat = model.woundsStat;
    restored.fnp = model.fnp;
    restored.saintlyRelics = model.saintlyRelics;
    restored.hardyx = model.hardyx;
    onChange(restored);
    setStatus(`Выбран профиль «${profile.name}»`);
  }

  async function change(action: 'save' | 'delete' | 'import') {
    if (busy) return;
    const title = action === 'save' ? name.trim() : current?.name;
    if (action !== 'import' && !title) return;
    setBusy(true);
    setStatus('');
    try {
      if (action === 'save') await requestProfiles(mode, accountId, 'PUT', {name: title, model: pack(model)});
      else if (action === 'delete') await requestProfiles(mode, accountId, 'DELETE', {name: title, revision: deleteRevision});
      else await importBrowserProfiles(mode, accountId);
      notifyProfiles(mode);
      if (!mounted.current) return;
      setForm(null);
      if (action === 'save') {
        setName(''); setSelected(title!); setStatus(`Профиль «${title}» сохранён в аккаунте`);
      } else if (action === 'delete') {
        setSelected(''); setStatus(`Профиль «${title}» удалён`);
      } else setStatus('Профили из этого браузера перенесены в аккаунт.');
    } catch (error) {
      if (!mounted.current) return;
      const code = error instanceof ProfileRequestError ? error.status : 0;
      if (code === 401) window.dispatchEvent(new Event(sessionChanged));
      else if (code === 409) setStatus(limitMessage);
      else if (code === 412) {
        setForm(null); setSelected(''); notifyProfiles(mode);
        setStatus('Профиль уже изменён или удалён. Выберите его заново.');
      } else {
        setStatus({
          save: 'Не удалось сохранить профиль. Повторите попытку.',
          delete: 'Не удалось удалить профиль. Повторите попытку.',
          import: 'Не удалось перенести профили. Копия в браузере сохранена.',
        }[action]);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return <div className="weapon-profiles">
    <select id={`${idPrefix}-weapon-profile`} aria-label="Сохранённые профили оружия" disabled={busy}
      value={current?.name || ''} onChange={event => select(profiles.find(row => row.name === event.target.value))}>
      <option value="">{`Мои профили оружия (${profiles.length})`}</option>
      {profiles.map(profile => <option key={profile.name} value={profile.name} data-ui-skip>{profile.name}</option>)}
    </select>
    <div className="weapon-profile-actions">
      <button type="button" className={buttonClass} disabled={busy} aria-expanded={form === 'save'}
        onClick={() => setForm(form === 'save' ? null : 'save')}>Сохранить профиль оружия</button>
      {current && <button type="button" className={buttonClass} disabled={busy} aria-expanded={form === 'delete'}
        onClick={() => {setDeleteRevision(current.revision); setForm(form === 'delete' ? null : 'delete');}}>Удалить профиль</button>}
    </div>
    {form === 'save' && <form className="scenario-save" onSubmit={event => {event.preventDefault(); void change('save');}}>
      <input aria-label="Название профиля оружия" placeholder="Например: Баньша" maxLength={100} value={name}
        onChange={event => setName(event.target.value)} autoFocus disabled={busy}/>
      <button type="submit" className="lab-button lab-button-primary lab-button-small" disabled={busy || !name.trim()}>Сохранить профиль</button>
      <small>Сохранение с тем же названием заменит профиль.</small>
    </form>}
    {form === 'delete' && current && <div className="weapon-profile-confirm">
      <small>{`Удалить профиль «${current.name}»?`}</small>
      <div className="weapon-profile-actions">
        <button type="button" className={buttonClass} disabled={busy} onClick={() => void change('delete')}>Удалить</button>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => setForm(null)}>Отмена</button>
      </div>
    </div>}
    {hasLegacy(mode, accountId) && <div className="weapon-profile-confirm">
      <small>В браузере есть старые профили этого режима. Перенесите их, если они ваши.</small>
      <button type="button" className={buttonClass} disabled={busy} onClick={() => void change('import')}>Перенести в мой аккаунт</button>
    </div>}
    {status && <small role="status">{status}</small>}
  </div>;
}

function ProfileLibrary(props: Props) {
  const {state, retry} = useLibrary(props.mode);
  if (state === 'loading') return null;
  if (state === 'guest') {
    if (!shell() && document.body.dataset.companionSection !== 'combat') return null;
    const href = shell()?.loginUrl() || '/account?next=' + encodeURIComponent(window.location.href);
    return <div className="weapon-profiles"><a href={href}>Войдите, чтобы сохранять профили оружия</a></div>;
  }
  if (state === 'error') return <div className="weapon-profiles">
    <small role="status">Не удалось загрузить профили оружия.</small>
    <button type="button" className={buttonClass} onClick={retry}>Повторить</button>
  </div>;
  return <AccountProfiles key={state.accountId} library={state} {...props}/>;
}

export default function WeaponProfiles(props: Props) {
  return <ProfileLibrary key={props.mode} {...props}/>;
}
