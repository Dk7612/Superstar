const test = require("node:test");
const assert = require("node:assert/strict");
const Physics3D = require("../physics3d");

const closeTo = (actual, expected, tolerance = .08) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
};

test("fixed timestep and default gravity advance dynamic bodies predictably", () => {
  const world = Physics3D.createWorld({ fixedTimeStep: 1 / 60 });
  const body = world.addBody({ shape: "sphere", radius: .5, position: { x: 0, y: 5, z: 0 }, linearDamping: 0, angularDamping: 0 });

  assert.equal(world.step(1 / 120), 0);
  assert.equal(world.step(1 / 120), 1);
  closeTo(body.velocity.y, -196.2 / 60, .01);
  assert.equal(world.step(1), 8);
});

test("sphere and plane contacts stop a falling body and report grounding", () => {
  const world = Physics3D.createWorld({ gravity: { x: 0, y: -18, z: 0 } });
  const floor = world.addBody({ type: "static", shape: "plane", position: { x: 0, y: 0, z: 0 } });
  const ball = world.addBody({
    shape: "sphere",
    radius: .5,
    position: { x: 0, y: 2, z: 0 },
    restitution: 0,
    angularDamping: 0
  });
  let collisions = 0;
  ball.onCollision = other => {
    if (other === floor) collisions++;
  };

  for (let frame = 0; frame < 60; frame++) world.step(1 / 60);
  closeTo(ball.position.y, .5, .04);
  closeTo(ball.velocity.y, 0, .04);
  assert.equal(ball.grounded, true);
  assert.ok(collisions > 0);
});

test("offset impulses rotate bodies and quaternion rotation preserves vector length", () => {
  const world = Physics3D.createWorld({ gravity: { x: 0, y: 0, z: 0 } });
  const box = world.addBody({
    shape: "box",
    halfExtents: { x: 1, y: .5, z: .5 },
    position: { x: 0, y: 0, z: 0 },
    linearDamping: 0,
    angularDamping: 0
  });
  box.applyImpulse({ x: 0, y: 0, z: 2 }, { x: 1, y: 0, z: 0 });
  assert.notEqual(box.angularVelocity.y, 0);
  world.step(1 / 60);
  const rotated = Physics3D.rotateVector(Physics3D.fromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2), { x: 2, y: 0, z: 0 });
  closeTo(Math.hypot(rotated.x, rotated.y, rotated.z), 2, 1e-6);
  closeTo(Math.abs(rotated.z), 2, 1e-6);
});

test("oriented box collisions resolve solid contacts", () => {
  const world = Physics3D.createWorld({ gravity: { x: 0, y: 0, z: 0 } });
  world.addBody({
    type: "static",
    shape: "box",
    position: { x: 0, y: 0, z: 0 },
    halfExtents: { x: 1, y: 1, z: 1 },
    orientation: Physics3D.fromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 4)
  });
  const body = world.addBody({
    shape: "box",
    position: { x: 1.1, y: 0, z: 0 },
    halfExtents: { x: .5, y: .5, z: .5 },
    velocity: { x: -1, y: 0, z: 0 },
    restitution: 0,
    angularDamping: 0
  });

  world.step(1 / 60);
  assert.ok(body.position.x > 1.1);
  assert.ok(body.contacts.length > 0);
});

test("position correction removes collider penetration in a single fixed step", () => {
  const world = Physics3D.createWorld({ gravity: { x: 0, y: 0, z: 0 } });
  world.addBody({ type: "static", shape: "box", halfExtents: { x: 1, y: 1, z: 1 } });
  const ball = world.addBody({ shape: "sphere", radius: .5, position: { x: 1.2, y: 0, z: 0 } });

  world.step(1 / 60);
  assert.ok(ball.position.x >= 1.49);
});

test("collision masks suppress contacts and sensors report without resolving", () => {
  const world = Physics3D.createWorld({ gravity: { x: 0, y: 0, z: 0 } });
  world.addBody({
    type: "static",
    shape: "box",
    halfExtents: { x: 1, y: 1, z: 1 },
    collisionGroup: 2
  });
  const filtered = world.addBody({
    shape: "sphere",
    radius: .5,
    position: { x: 1, y: 0, z: 0 },
    collisionMask: 1,
    velocity: { x: -1, y: 0, z: 0 }
  });
  world.step(1 / 60);
  closeTo(filtered.position.x, 1 - 1 / 60, .001);
  assert.equal(filtered.contacts.length, 0);

  const sensorWorld = Physics3D.createWorld({ gravity: { x: 0, y: 0, z: 0 } });
  sensorWorld.addBody({ type: "static", shape: "box", halfExtents: { x: 1, y: 1, z: 1 }, isSensor: true });
  const sensed = sensorWorld.addBody({ shape: "sphere", radius: .5, position: { x: 1, y: 0, z: 0 }, velocity: { x: -1, y: 0, z: 0 } });
  sensorWorld.step(1 / 60);
  closeTo(sensed.position.x, 1 - 1 / 60, .001);
  assert.equal(sensed.contacts[0].sensor, true);
});

test("raycasts honor rotated colliders, filters, and distance limits", () => {
  const world = Physics3D.createWorld({ gravity: { x: 0, y: 0, z: 0 } });
  const wall = world.addBody({
    type: "static",
    shape: "box",
    position: { x: 0, y: 0, z: 4 },
    halfExtents: { x: 2, y: 2, z: .25 },
    orientation: Physics3D.fromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 4)
  });
  const hit = world.raycast({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }, 10);
  assert.equal(hit.body, wall);
  closeTo(hit.distance, 4 - .25 / Math.SQRT1_2, .02);
  assert.equal(world.raycast({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1), null);
  assert.equal(world.raycast({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 10, () => false), null);
});
