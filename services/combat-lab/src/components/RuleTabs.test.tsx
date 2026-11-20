import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import RuleTabs from './RuleTabs';

const originalMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = originalMatchMedia; });

it('starts with both mobile sections closed and preserves rule choices across folding and resizing', () => {
  const viewport = Object.assign(new EventTarget(), {matches: true});
  window.matchMedia = () => viewport as MediaQueryList;
  const resize = (mobile: boolean) => act(() => {
    viewport.matches = mobile;
    viewport.dispatchEvent(new Event('change'));
  });
  render(<RuleTabs prefix="profile">{group => <input type="checkbox" aria-label={group}/>}</RuleTabs>);

  const advanced = screen.getByRole('button', {name: 'Advanced'});
  const faction = screen.getByRole('button', {name: 'Фракционные правила'});
  expect(advanced.getAttribute('aria-expanded')).toBe('false');
  expect(faction.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('checkbox')).toBeNull();

  fireEvent.click(faction);
  const rule = screen.getByRole('checkbox', {name: 'faction'}) as HTMLInputElement;
  fireEvent.click(rule);
  fireEvent.click(advanced);
  expect(screen.getAllByRole('region')).toHaveLength(2);
  fireEvent.click(faction);
  expect(screen.queryByRole('checkbox', {name: 'faction'})).toBeNull();
  expect(screen.getByRole('checkbox', {name: 'general'})).toBeTruthy();

  resize(false);
  expect(screen.getByRole('tab', {name: 'Advanced'}).getAttribute('aria-selected')).toBe('true');
  fireEvent.click(screen.getByRole('tab', {name: 'Фракционные правила'}));
  expect(screen.getByRole('checkbox', {name: 'faction'})).toBe(rule);
  expect(rule.checked).toBe(true);

  resize(true);
  expect(faction.getAttribute('aria-expanded')).toBe('false');
  expect(advanced.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(faction);
  expect(screen.getByRole('checkbox', {name: 'faction'})).toBe(rule);
  expect(rule.checked).toBe(true);
});
