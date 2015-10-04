var test = require('tape');

test('define an action', function(t) {
  t.plan(2);
  t.equal(1 + 1, 2);
  t.equal(3 + 4, 7);
});