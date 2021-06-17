// [prettierx] test script notice:
// This test script runs for test files in another directory,
// **not** on any files in *this* directory.

// [FUTURE TBD] use Nodejs path function (...)
const dirPath = `${__dirname}/../js/computed-props`;

run_spec(dirPath, ["babel", "babel-flow"], {
  computedPropertySpacing: true,
});
