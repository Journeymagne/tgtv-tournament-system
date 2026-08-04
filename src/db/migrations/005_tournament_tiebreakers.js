const SCHEMA = `
  UPDATE tournaments
  SET tiebreaker_order = array_remove(
    array_replace(tiebreaker_order, 'buchholz', 'strength_of_schedule'),
    'match_wins'
  )
  WHERE 'buchholz' = ANY(tiebreaker_order)
     OR 'match_wins' = ANY(tiebreaker_order);
`;

module.exports = {
  version: 5,
  name: "tournament_tiebreakers",
  async up(client) {
    await client.query(SCHEMA);
  }
};
