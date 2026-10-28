module.exports = {
  version: 69,
  name: 'map_catalog',
  async up(client) {
    await client.query(`ALTER TABLE tournament_tables DROP CONSTRAINT tournament_tables_deployment_check;
      ALTER TABLE tournament_tables ADD CONSTRAINT tournament_tables_deployment_check
      CHECK (deployment IS NULL OR deployment BETWEEN 1 AND CASE WHEN killzone = 'Squad-Games Gallowdark+' THEN 13 ELSE 6 END);`);
  }
};
