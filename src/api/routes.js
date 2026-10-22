// Compatibility entry point for the single-process deployment.
module.exports = [
  ...require("./routes-tournaments"),
  ...require("./routes-knowthykt"),
  ...require("./routes-faq"),
  ...require("./routes-accounts"),
  ...require("./routes-studio"),
  ...require("./routes-notifications")
];
