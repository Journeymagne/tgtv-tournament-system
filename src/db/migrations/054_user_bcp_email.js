module.exports = {
  version: 54,
  name: "user_bcp_email",
  async up(client) {
    await client.query(`
      ALTER TABLE users ADD COLUMN bcp_email TEXT
        CHECK (bcp_email IS NULL OR char_length(bcp_email) <= 254);
    `);
  }
};
