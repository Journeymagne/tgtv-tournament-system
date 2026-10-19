// Stable ownership map. Historical migrations still run in public before 058.
const TABLES = {
  accounts: ['users','sessions','platform_ownership','administrative_audit_events','user_email_accounts','email_tokens','email_outbox','email_suppressions','email_webhook_events','email_rate_limits','feedback'],
  notifications: ['notification_inbox_state','notification_inbox_items'],
  tournaments: ['challenges','games','game_participants','tournaments','tournament_participants','tournament_rounds','tournament_matches','tournament_audit_events','tournament_tables','tournament_table_images','player_teams','player_team_memberships','player_team_invitations','player_team_audit_events','tournament_team_rosters','tournament_team_roster_members','tournament_team_matches','tournament_team_match_games','tournament_judges','documentation_pages','achievements','achievement_awards','achievement_award_members','telegram_links','telegram_link_tokens','telegram_updates','telegram_state','telegram_events','telegram_outbox'],
  studio: ['studio_projects','studio_tts_exports','studio_tts_assets','studio_reviews','studio_review_audit','studio_review_reports','studio_discussion_state','studio_review_preferences','studio_review_ratings','studio_comments','studio_comment_audit','studio_comment_reports'],
  faq: ['faq_entries','faq_submissions','faq_questions','faq_history']
};
const SCHEMAS = Object.keys(TABLES);
const SEARCH_PATH = ['public', ...SCHEMAS].join(',');
module.exports = { TABLES, SCHEMAS, SEARCH_PATH };
