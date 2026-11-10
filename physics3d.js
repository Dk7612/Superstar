(function (root, factory) {
  const physics = factory();
  if (typeof module === "object" && module.exports) module.exports = physics;
  if (root) root.SuperstarPhysics3D = physics;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const EPSILON = 1e-8;
  const AXES = ["x", "y", "z"];

  function vector(x = 0, y = 0, z = 0) {
    if (typeof x === "object" && x !== null) return { x: x.x || 0, y: x.y || 0, z: x.z || 0 };
    return { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 };
  }
  const vAdd = (a, b) => vector(a.x + b.x, a.y + b.y, a.z + b.z);
  const vSub = (a, b) => vector(a.x - b.x, a.y - b.y, a.z - b.z);
  const vScale = (a, n) => vector(a.x * n, a.y * n, a.z * n);
  const vDot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const vCross = (a, b) => vector(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const vLength = value => Math.sqrt(vDot(value, value));
  const vNormalize = value => {
    const magnitude = vLength(value);
    return magnitude > EPSILON ? vScale(value, 1 / magnitude) : vector(0, 1, 0);
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function quaternion(x = 0, y = 0, z = 0, w = 1) {
    if (typeof x === "object" && x !== null) return normalizeQuaternion({ x: x.x || 0, y: x.y || 0, z: x.z || 0, w: x.w ?? 1 });
    return normalizeQuaternion({ x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0, w: Number(w) || 0 });
  }
  function normalizeQuaternion(value) {
    const magnitude = Math.hypot(value.x, value.y, value.z, value.w) || 1;
    return { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude, w: value.w / magnitude };
  }
  function qMultiply(a, b) {
    return {
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
    };
  }
  function qConjugate(value) {
    return { x: -value.x, y: -value.y, z: -value.z, w: value.w };
  }
  function qRotate(rotation, value) {
    const q = { x: value.x, y: value.y, z: value.z, w: 0 };
    const rotated = qMultiply(qMultiply(rotation, q), qConjugate(rotation));
    return vector(rotated.x, rotated.y, rotated.z);
  }
  function qFromAxisAngle(axis, angle) {
    const halfAngle = angle / 2;
    const direction = vNormalize(axis);
    const sine = Math.sin(halfAngle);
    return quaternion(direction.x * sine, direction.y * sine, direction.z * sine, Math.cos(halfAngle));
  }
  function qIntegrate(rotation, angularVelocity, deltaTime) {
    const speed = vLength(angularVelocity);
    if (speed < EPSILON || deltaTime === 0) return rotation;
    return normalizeQuaternion(qMultiply(qFromAxisAngle(angularVelocity, speed * deltaTime), rotation));
  }

  function inverseInertiaLocal(body, torque) {
    const localTorque = qRotate(qConjugate(body.orientation), torque);
    return qRotate(body.orientation, vector(
      localTorque.x * body.inverseInertia.x,
      localTorque.y * body.inverseInertia.y,
      localTorque.z * body.inverseInertia.z
    ));
  }
  function makeBody(options = {}) {
    const shape = options.shape || "box";
    const type = options.type || "dynamic";
    if (!["box", "sphere", "plane"].includes(shape)) throw new TypeError(`Unsupported physics shape: ${shape}`);
    if (!["static", "dynamic", "kinematic"].includes(type)) throw new TypeError(`Unsupported physics body type: ${type}`);

    const mass = type === "dynamic" ? Number(options.mass ?? 1) : 0;
    if (type === "dynamic" && (!Number.isFinite(mass) || mass <= 0)) throw new RangeError("Dynamic body mass must be greater than zero");
    const halfExtents = vector(options.halfExtents || vector(.5, .5, .5));
    const radius = Number(options.radius ?? .5);
    const maxSpeed = Number(options.maxSpeed ?? Infinity);
    const orientation = quaternion(options.orientation || options.rotation || {});
    const body = {
      type,
      shape,
      position: vector(options.position),
      orientation,
      velocity: vector(options.velocity),
      angularVelocity: vector(options.angularVelocity),
      acceleration: vector(options.acceleration),
      force: vector(),
      torque: vector(),
      halfExtents,
      radius,
      planeNormal: vNormalize(vector(options.normal || vector(0, 1, 0))),
      mass,
      inverseMass: type === "dynamic" ? 1 / mass : 0,
      inverseInertia: vector(),
      restitution: clamp(Number(options.restitution ?? .05), 0, 1),
      friction: Math.max(0, Number(options.friction ?? .6)),
      gravityScale: Number(options.gravityScale ?? 1),
      linearDamping: Math.max(0, Number(options.linearDamping ?? 0)),
      angularDamping: Math.max(0, Number(options.angularDamping ?? .02)),
      maxSpeed,
      collisionGroup: Number(options.collisionGroup ?? 1) | 0,
      collisionMask: Number(options.collisionMask ?? -1) | 0,
      isSensor: Boolean(options.isSensor),
      userData: options.userData ?? null,
      onCollision: typeof options.onCollision === "function" ? options.onCollision : null,
      grounded: false,
      contacts: [],
      applyForce(force, worldPoint) {
        if (this.inverseMass === 0) return;
        this.force = vAdd(this.force, force);
        if (worldPoint) this.torque = vAdd(this.torque, vCross(vSub(worldPoint, this.position), force));
      },
      applyTorque(torque) {
        if (this.inverseMass !== 0) this.torque = vAdd(this.torque, torque);
      },
      applyImpulse(impulse, worldPoint) {
        if (this.inverseMass === 0) return;
        this.velocity = vAdd(this.velocity, vScale(impulse, this.inverseMass));
        if (worldPoint) this.angularVelocity = vAdd(this.angularVelocity, inverseInertiaLocal(this, vCross(vSub(worldPoint, this.position), impulse)));
      },
      setPosition(position) {
        this.position = vector(position);
      },
      setOrientation(rotation) {
        this.orientation = quaternion(rotation);
      },
      setVelocity(velocity) {
        this.velocity = vector(velocity);
      }
    };

    if (shape === "box" && AXES.some(axis => !Number.isFinite(halfExtents[axis]) || halfExtents[axis] <= 0)) {
      throw new RangeError("Box half-extents must be finite and greater than zero");
    }
    if (shape === "sphere" && (!Number.isFinite(radius) || radius <= 0)) {
      throw new RangeError("Sphere radius must be finite and greater than zero");
    }
    if (!(maxSpeed > 0)) throw new RangeError("maxSpeed must be greater than zero");
    if (shape === "plane" && type === "dynamic") throw new TypeError("Plane colliders must be static or kinematic");

    if (type === "dynamic") {
      let inertia;
      if (shape === "sphere") {
        inertia = vector(.4 * mass * radius * radius, .4 * mass * radius * radius, .4 * mass * radius * radius);
      } else if (shape === "box") {
        inertia = vector(
          mass * (halfExtents.y ** 2 + halfExtents.z ** 2) / 3,
          mass * (halfExtents.x ** 2 + halfExtents.z ** 2) / 3,
          mass * (halfExtents.x ** 2 + halfExtents.y ** 2) / 3
        );
      } else {
        inertia = vector(0, 0, 0);
      }
      body.inverseInertia = vector(
        inertia.x > EPSILON ? 1 / inertia.x : 0,
        inertia.y > EPSILON ? 1 / inertia.y : 0,
        inertia.z > EPSILON ? 1 / inertia.z : 0
      );
    }
    return body;
  }

  function boxAxes(body) {
    return [
      qRotate(body.orientation, vector(1, 0, 0)),
      qRotate(body.orientation, vector(0, 1, 0)),
      qRotate(body.orientation, vector(0, 0, 1))
    ];
  }
  function projectedRadius(body, axis, axes = boxAxes(body)) {
    return body.halfExtents.x * Math.abs(vDot(axes[0], axis)) +
      body.halfExtents.y * Math.abs(vDot(axes[1], axis)) +
      body.halfExtents.z * Math.abs(vDot(axes[2], axis));
  }
  function supportPoint(body, direction, axes = boxAxes(body)) {
    let point = vector(body.position);
    for (let index = 0; index < 3; index++) {
      const axis = axes[index];
      const extent = body.halfExtents[AXES[index]];
      point = vAdd(point, vScale(axis, (vDot(axis, direction) >= 0 ? 1 : -1) * extent));
    }
    return point;
  }
  function boxBox(a, b) {
    const axesA = boxAxes(a), axesB = boxAxes(b);
    const centerDelta = vSub(b.position, a.position);
    let bestDepth = Infinity, bestNormal = null;
    const candidates = [...axesA, ...axesB];
    for (const axisA of axesA) for (const axisB of axesB) candidates.push(vCross(axisA, axisB));
    for (const candidate of candidates) {
      const magnitude = vLength(candidate);
      if (magnitude < EPSILON) continue;
      const axis = vScale(candidate, 1 / magnitude);
      const overlap = projectedRadius(a, axis, axesA) + projectedRadius(b, axis, axesB) - Math.abs(vDot(centerDelta, axis));
      if (overlap <= 0) return null;
      if (overlap < bestDepth) {
        bestDepth = overlap;
        bestNormal = vDot(centerDelta, axis) < 0 ? vScale(axis, -1) : axis;
      }
    }
    return bestNormal && {
      normal: bestNormal,
      depth: bestDepth,
      point: vScale(vAdd(supportPoint(a, bestNormal, axesA), supportPoint(b, vScale(bestNormal, -1), axesB)), .5)
    };
  }
  function sphereSphere(a, b) {
    const delta = vSub(b.position, a.position);
    const distance = vLength(delta);
    const depth = a.radius + b.radius - distance;
    if (depth <= 0) return null;
    const normal = distance > EPSILON ? vScale(delta, 1 / distance) : vector(0, 1, 0);
    return { normal, depth, point: vAdd(a.position, vScale(normal, a.radius - depth * .5)) };
  }
  function sphereBox(sphere, box) {
    const axes = boxAxes(box), relative = vSub(sphere.position, box.position);
    const local = vector(vDot(relative, axes[0]), vDot(relative, axes[1]), vDot(relative, axes[2]));
    const closestLocal = vector(
      clamp(local.x, -box.halfExtents.x, box.halfExtents.x),
      clamp(local.y, -box.halfExtents.y, box.halfExtents.y),
      clamp(local.z, -box.halfExtents.z, box.halfExtents.z)
    );
    const closest = box.position;
    let point = vector(closest);
    for (let index = 0; index < 3; index++) point = vAdd(point, vScale(axes[index], closestLocal[AXES[index]]));
    const delta = vSub(point, sphere.position);
    const distance = vLength(delta);
    if (distance > sphere.radius) return null;
    if (distance > EPSILON) {
      const normal = vScale(delta, 1 / distance);
      return { normal, depth: sphere.radius - distance, point };
    }

    let axisIndex = 0;
    let faceDistance = box.halfExtents.x - Math.abs(local.x);
    for (let index = 1; index < 3; index++) {
      const distanceToFace = box.halfExtents[AXES[index]] - Math.abs(local[AXES[index]]);
      if (distanceToFace < faceDistance) {
        axisIndex = index;
        faceDistance = distanceToFace;
      }
    }
    const sign = local[AXES[axisIndex]] >= 0 ? 1 : -1;
    const outward = vScale(axes[axisIndex], sign);
    return {
      normal: vScale(outward, -1),
      depth: sphere.radius + faceDistance,
      point: vAdd(sphere.position, vScale(outward, faceDistance))
    };
  }
  function planeCollision(plane, body) {
    const normal = qRotate(plane.orientation, plane.planeNormal);
    const signedDistance = vDot(vSub(body.position, plane.position), normal);
    const radius = body.shape === "sphere" ? body.radius : projectedRadius(body, normal);
    const depth = radius - signedDistance;
    if (depth <= 0) return null;
    const point = vSub(body.position, vScale(normal, radius));
    return { normal, depth, point };
  }
  function detectCollision(a, b) {
    if (a.shape === "plane" && b.shape === "plane") return null;
    if (a.shape === "plane") return planeCollision(a, b);
    if (b.shape === "plane") {
      const collision = planeCollision(b, a);
      return collision && { normal: vScale(collision.normal, -1), depth: collision.depth, point: collision.point };
    }
    if (a.shape === "box" && b.shape === "box") return boxBox(a, b);
    if (a.shape === "sphere" && b.shape === "sphere") return sphereSphere(a, b);
    if (a.shape === "sphere") return sphereBox(a, b);
    const collision = sphereBox(b, a);
    return collision && { normal: vScale(collision.normal, -1), depth: collision.depth, point: collision.point };
  }

  function bounds(body) {
    if (body.shape === "plane") return null;
    if (body.shape === "sphere") {
      const radius = body.radius;
      return {
        min: vSub(body.position, vector(radius, radius, radius)),
        max: vAdd(body.position, vector(radius, radius, radius))
      };
    }
    const axes = boxAxes(body);
    const extent = vector(
      projectedRadius(body, vector(1, 0, 0), axes),
      projectedRadius(body, vector(0, 1, 0), axes),
      projectedRadius(body, vector(0, 0, 1), axes)
    );
    return { min: vSub(body.position, extent), max: vAdd(body.position, extent) };
  }
  function canCollide(a, b) {
    return ((a.collisionMask & b.collisionGroup) !== 0) &&
      ((b.collisionMask & a.collisionGroup) !== 0);
  }
  function broadphase(bodies) {
    const finite = [], planes = [];
    for (const body of bodies) {
      const aabb = bounds(body);
      if (aabb) finite.push({ body, ...aabb });
      else planes.push(body);
    }
    finite.sort((a, b) => a.min.x - b.min.x);
    const pairs = [];
    for (let first = 0; first < finite.length; first++) {
      const a = finite[first];
      for (let second = first + 1; second < finite.length && finite[second].min.x <= a.max.x; second++) {
        const b = finite[second];
        if (a.body.inverseMass === 0 && b.body.inverseMass === 0) continue;
        if (!canCollide(a.body, b.body)) continue;
        if (a.max.y < b.min.y || b.max.y < a.min.y || a.max.z < b.min.z || b.max.z < a.min.z) continue;
        pairs.push([a.body, b.body]);
      }
    }
    for (const plane of planes) {
      for (const entry of finite) {
        if (plane.inverseMass === 0 && entry.body.inverseMass === 0) continue;
        if (canCollide(plane, entry.body)) pairs.push([plane, entry.body]);
      }
    }
    return pairs;
  }
  function velocityAtPoint(body, offset) {
    return vAdd(body.velocity, vCross(body.angularVelocity, offset));
  }
  function effectiveMass(body, offset, axis) {
    const angular = vCross(inverseInertiaLocal(body, vCross(offset, axis)), offset);
    return body.inverseMass + vDot(angular, axis);
  }
  function applyPairImpulse(a, b, point, impulse) {
    const offsetA = vSub(point, a.position), offsetB = vSub(point, b.position);
    if (a.inverseMass) {
      a.velocity = vSub(a.velocity, vScale(impulse, a.inverseMass));
      a.angularVelocity = vSub(a.angularVelocity, inverseInertiaLocal(a, vCross(offsetA, impulse)));
    }
    if (b.inverseMass) {
      b.velocity = vAdd(b.velocity, vScale(impulse, b.inverseMass));
      b.angularVelocity = vAdd(b.angularVelocity, inverseInertiaLocal(b, vCross(offsetB, impulse)));
    }
  }
  function resolvePositions(pair) {
    const { a, b, collision } = pair;
    const inverseMass = a.inverseMass + b.inverseMass;
    if (inverseMass <= 0 || a.isSensor || b.isSensor) return;
    const correction = Math.max(collision.depth - .001, 0) / inverseMass;
    if (a.inverseMass) a.position = vSub(a.position, vScale(collision.normal, correction * a.inverseMass));
    if (b.inverseMass) b.position = vAdd(b.position, vScale(collision.normal, correction * b.inverseMass));
  }
  function resolveVelocity(pair) {
    const { a, b, collision } = pair;
    const inverseMass = a.inverseMass + b.inverseMass;
    if (inverseMass <= 0 || a.isSensor || b.isSensor) return;
    const offsetA = vSub(collision.point, a.position), offsetB = vSub(collision.point, b.position);
    let relativeVelocity = vSub(velocityAtPoint(b, offsetB), velocityAtPoint(a, offsetA));
    const normalSpeed = vDot(relativeVelocity, collision.normal);
    if (normalSpeed >= 0) return;
    const normalMass = effectiveMass(a, offsetA, collision.normal) + effectiveMass(b, offsetB, collision.normal);
    if (normalMass <= EPSILON) return;
    const restitution = normalSpeed < -1 ? Math.min(a.restitution, b.restitution) : 0;
    const impulseMagnitude = -(1 + restitution) * normalSpeed / normalMass;
    const oldNormalImpulse = pair.normalImpulse;
    pair.normalImpulse = Math.max(0, oldNormalImpulse + impulseMagnitude);
    applyPairImpulse(a, b, collision.point, vScale(collision.normal, pair.normalImpulse - oldNormalImpulse));

    relativeVelocity = vSub(velocityAtPoint(b, offsetB), velocityAtPoint(a, offsetA));
    const tangentVelocity = vSub(relativeVelocity, vScale(collision.normal, vDot(relativeVelocity, collision.normal)));
    const tangentLength = vLength(tangentVelocity);
    if (tangentLength < EPSILON) return;
    const tangent = vScale(tangentVelocity, 1 / tangentLength);
    const tangentMass = effectiveMass(a, offsetA, tangent) + effectiveMass(b, offsetB, tangent);
    if (tangentMass <= EPSILON) return;
    const frictionLimit = pair.normalImpulse * Math.sqrt(a.friction * b.friction);
    const oldFrictionImpulse = pair.frictionImpulse;
    pair.frictionImpulse = clamp(oldFrictionImpulse - vDot(relativeVelocity, tangent) / tangentMass, -frictionLimit, frictionLimit);
    applyPairImpulse(a, b, collision.point, vScale(tangent, pair.frictionImpulse - oldFrictionImpulse));
  }
  function collisionRecord(a, b, collision) {
    return { a, b, collision, normalImpulse: 0, frictionImpulse: 0 };
  }

  function rayBox(origin, direction, body, maxDistance) {
    const inverse = qConjugate(body.orientation);
    const localOrigin = qRotate(inverse, vSub(origin, body.position));
    const localDirection = qRotate(inverse, direction);
    let near = 0, far = maxDistance, normal = vector();
    for (const axis of AXES) {
      if (Math.abs(localDirection[axis]) < EPSILON) {
        if (localOrigin[axis] < -body.halfExtents[axis] || localOrigin[axis] > body.halfExtents[axis]) return null;
        continue;
      }
      let first = (-body.halfExtents[axis] - localOrigin[axis]) / localDirection[axis];
      let second = (body.halfExtents[axis] - localOrigin[axis]) / localDirection[axis];
      let sign = -Math.sign(localDirection[axis]);
      if (first > second) {
        [first, second] = [second, first];
        sign *= -1;
      }
      if (first > near) {
        near = first;
        normal = vector();
        normal[axis] = sign;
      }
      far = Math.min(far, second);
      if (near > far) return null;
    }
    if (far < 0 || near > maxDistance) return null;
    const distance = Math.max(0, near);
    if (distance === 0 && vLength(normal) < EPSILON) normal = vScale(localDirection, -1);
    return { distance, normal: qRotate(body.orientation, normal) };
  }
  function raySphere(origin, direction, body, maxDistance) {
    const offset = vSub(origin, body.position);
    const projection = vDot(offset, direction);
    const discriminant = projection * projection - (vDot(offset, offset) - body.radius ** 2);
    if (discriminant < 0) return null;
    const near = -projection - Math.sqrt(discriminant);
    const far = -projection + Math.sqrt(discriminant);
    const distance = near >= 0 ? near : far >= 0 ? 0 : -1;
    if (distance < 0 || distance > maxDistance) return null;
    const point = vAdd(origin, vScale(direction, distance));
    return { distance, normal: vNormalize(vSub(point, body.position)) };
  }
  function rayPlane(origin, direction, body, maxDistance) {
    const normal = qRotate(body.orientation, body.planeNormal);
    const denominator = vDot(direction, normal);
    if (Math.abs(denominator) < EPSILON) return null;
    const distance = vDot(vSub(body.position, origin), normal) / denominator;
    if (distance < 0 || distance > maxDistance) return null;
    return { distance, normal: denominator < 0 ? normal : vScale(normal, -1) };
  }

  class World {
    constructor(options = {}) {
      this.gravity = vector(options.gravity || vector(0, -196.2, 0));
      this.fixedTimeStep = Number(options.fixedTimeStep ?? 1 / 60);
      this.maxSubSteps = Math.max(1, Math.floor(options.maxSubSteps ?? 8));
      this.solverIterations = Math.max(1, Math.floor(options.solverIterations ?? 6));
      this.accumulator = 0;
      this.bodies = [];
      if (!Number.isFinite(this.fixedTimeStep) || this.fixedTimeStep <= 0) throw new RangeError("fixedTimeStep must be greater than zero");
    }

    addBody(options) {
      const body = makeBody(options);
      this.bodies.push(body);
      return body;
    }

    removeBody(body) {
      const index = this.bodies.indexOf(body);
      if (index === -1) return false;
      this.bodies.splice(index, 1);
      return true;
    }

    clear() {
      this.bodies.length = 0;
      this.accumulator = 0;
    }

    raycast(origin, direction, maxDistance = Infinity, filter = () => true) {
      const rayLength = vLength(direction);
      if (rayLength < EPSILON) throw new RangeError("Ray direction must not be zero");
      if (maxDistance < 0) throw new RangeError("maxDistance must be non-negative");
      const rayDirection = vScale(direction, 1 / rayLength);
      let closest = null;
      for (const body of this.bodies) {
        if (!filter(body)) continue;
        const availableDistance = closest ? closest.distance : maxDistance;
        const hit = body.shape === "plane"
          ? rayPlane(origin, rayDirection, body, availableDistance)
          : body.shape === "sphere"
            ? raySphere(origin, rayDirection, body, availableDistance)
            : rayBox(origin, rayDirection, body, availableDistance);
        if (hit && (!closest || hit.distance < closest.distance)) {
          closest = {
            body,
            distance: hit.distance,
            position: vAdd(origin, vScale(rayDirection, hit.distance)),
            normal: hit.normal
          };
        }
      }
      return closest;
    }

    step(deltaTime) {
      if (!Number.isFinite(deltaTime) || deltaTime < 0) throw new RangeError("deltaTime must be a non-negative number");
      this.accumulator += Math.min(deltaTime, this.fixedTimeStep * this.maxSubSteps);
      let steps = 0;
      while (this.accumulator >= this.fixedTimeStep && steps < this.maxSubSteps) {
        this.#stepFixed(this.fixedTimeStep);
        this.accumulator -= this.fixedTimeStep;
        steps++;
      }
      if (steps) {
        for (const body of this.bodies) {
          body.force = vector();
          body.torque = vector();
        }
      }
      return steps;
    }

    #stepFixed(deltaTime) {
      for (const body of this.bodies) {
        body.grounded = false;
        body.contacts.length = 0;
        if (body.type === "static") continue;
        if (body.type === "dynamic") {
          const acceleration = vAdd(vScale(this.gravity, body.gravityScale), body.acceleration);
          body.velocity = vAdd(body.velocity, vAdd(vScale(acceleration, deltaTime), vScale(body.force, body.inverseMass * deltaTime)));
          body.angularVelocity = vAdd(body.angularVelocity, vScale(inverseInertiaLocal(body, body.torque), deltaTime));
        }
        body.velocity = vScale(body.velocity, Math.exp(-body.linearDamping * deltaTime));
        body.angularVelocity = vScale(body.angularVelocity, Math.exp(-body.angularDamping * deltaTime));
        const speed = vLength(body.velocity);
        if (speed > body.maxSpeed) body.velocity = vScale(body.velocity, body.maxSpeed / speed);
        body.position = vAdd(body.position, vScale(body.velocity, deltaTime));
        body.orientation = qIntegrate(body.orientation, body.angularVelocity, deltaTime);
      }

      const pairs = broadphase(this.bodies)
        .map(([a, b]) => {
          const collision = detectCollision(a, b);
          return collision ? collisionRecord(a, b, collision) : null;
        })
        .filter(Boolean);

      for (const pair of pairs) resolvePositions(pair);
      for (let iteration = 0; iteration < this.solverIterations; iteration++) {
        for (const pair of pairs) resolveVelocity(pair);
      }

      for (const { a, b, collision } of pairs) {
        const normalA = vScale(collision.normal, -1);
        const contactA = { body: b, normal: normalA, depth: collision.depth, position: collision.point, sensor: a.isSensor || b.isSensor };
        const contactB = { body: a, normal: collision.normal, depth: collision.depth, position: collision.point, sensor: a.isSensor || b.isSensor };
        a.contacts.push(contactA);
        b.contacts.push(contactB);
        if (normalA.y > .5) a.grounded = true;
        if (collision.normal.y > .5) b.grounded = true;
        a.onCollision?.(b, contactA);
        b.onCollision?.(a, contactB);
      }
    }
  }

  return {
    version: "1.0.0",
    vector,
    quaternion,
    fromAxisAngle: qFromAxisAngle,
    rotateVector: qRotate,
    World,
    createWorld: options => new World(options)
  };
});
