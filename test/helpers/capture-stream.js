// Capture what would otherwise hit a real stream (stdout/stderr) so test
// output stays clean, and so tests can assert on exactly what was written.
function captureStream(stream) {
  const original = stream.write;
  const calls = [];
  stream.write = (chunk, ...rest) => {
    calls.push(String(chunk));
    // Don't actually forward to the real stream during the test.
    if (typeof rest[rest.length - 1] === "function") rest[rest.length - 1]();
    return true;
  };
  return {
    calls,
    restore() {
      stream.write = original;
    }
  };
}

module.exports = { captureStream };
