// Third-person orbit camera with lock-on framing, collision and shake.

import * as THREE from 'three';
import { angleDiff, clamp, damp, wrapAngle, yawTo } from '../core/math';
import { fxRng } from '../core/rng';
import type { World } from '../world/world';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 0.32;
  distance = 6.4;
  targetDistance = 6.4;
  private focus = new THREE.Vector3();
  private shakeAmt = 0;
  shakeEnabled = true;
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 900);
  }

  snapBehind(yaw: number) {
    this.yaw = yaw;
    this.pitch = 0.32;
    this.initialized = false;
  }

  shake(amount: number) {
    if (!this.shakeEnabled) return;
    this.shakeAmt = Math.min(1.2, this.shakeAmt + amount);
  }

  update(dt: number, lookX: number, lookY: number, player: THREE.Vector3, lock: THREE.Vector3 | null, world: World, extraDistance = 0) {
    if (lock) {
      const want = yawTo(player.x, player.z, lock.x, lock.z);
      this.yaw = wrapAngle(this.yaw + angleDiff(this.yaw, want) * damp(7, dt));
      const d = Math.hypot(lock.x - player.x, lock.z - player.z);
      const wantPitch = clamp(0.38 - d * 0.008, 0.18, 0.42);
      this.pitch += (wantPitch - this.pitch) * damp(4, dt);
      // Allow slight manual adjustment while locked.
      this.pitch = clamp(this.pitch + lookY * 0.3, -0.2, 1.1);
    } else {
      this.yaw = wrapAngle(this.yaw - lookX);
      this.pitch = clamp(this.pitch + lookY, -0.35, 1.15);
    }
    this.targetDistance = 6.4 + extraDistance;
    this.distance += (this.targetDistance - this.distance) * damp(3, dt);

    const focusTarget = new THREE.Vector3(player.x, player.y + 1.55, player.z);
    if (lock) focusTarget.lerp(new THREE.Vector3(lock.x, lock.y + 1.2, lock.z), 0.18);
    if (!this.initialized) {
      this.focus.copy(focusTarget);
      this.initialized = true;
    } else this.focus.lerp(focusTarget, damp(14, dt));

    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    let desired = this.focus.clone().addScaledVector(dir, -this.distance);
    const frac = world.cameraClearance(this.focus, desired);
    if (frac < 1) desired = this.focus.clone().addScaledVector(dir, -this.distance * Math.max(0.2, frac));
    const ground = world.groundY(desired.x, desired.z) + 0.45;
    if (desired.y < ground) desired.y = ground;

    this.camera.position.copy(desired);
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.18;
      this.camera.position.x += (fxRng.next() - 0.5) * s;
      this.camera.position.y += (fxRng.next() - 0.5) * s;
      this.camera.position.z += (fxRng.next() - 0.5) * s;
      this.shakeAmt *= Math.exp(-dt * 9);
    }
    this.camera.lookAt(this.focus);
  }

  /** Horizontal forward direction the camera is facing (yaw). */
  get forwardYaw(): number {
    return this.yaw;
  }
}
