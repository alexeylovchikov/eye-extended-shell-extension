/* catBrain.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Behaviour of the desktop cat. This module knows nothing about the shell:
// it is given the time step, the pointer position and the screen bounds, and
// tells which sprite to show where. That keeps it testable on its own.

// Screen coordinates have positive Y pointing down.
export const DIRECTIONS = [
    [0, 'right'], [45, 'down-right'], [67.5, 'south-southeast'],
    [90, 'down'], [112.5, 'south-southwest'], [135, 'down-left'],
    [180, 'left'], [225, 'up-left'], [247.5, 'north-northwest'],
    [270, 'up'], [292.5, 'north-northeast'], [315, 'up-right'],
];

// Frame durations of the reactions to a click, in seconds
export const REACTIONS = {
    swipe: [0.10, 0.10, 0.15, 0.08, 0.08, 0.09, 0.12, 0.16],
    tumble: [0.11, 0.10, 0.22, 0.14, 0.10, 0.10, 0.24, 0.16],
    roll: [0.10, 0.12, 0.13, 0.12, 0.22, 0.12, 0.12, 0.15],
    jump: [0.09, 0.10, 0.13, 0.09, 0.15, 0.09, 0.12, 0.13],
};

// Number of frames of every sprite
export const SPRITES = {
    groom: 8,
    sleep: 2,
    sad: 2,
    held: 2,
};
for (const [, name] of DIRECTIONS)
    SPRITES[name] = 4;
for (const name in REACTIONS)
    SPRITES[name] = REACTIONS[name].length;

// The cat was drawn for this size; distances below are given for it
export const BASE_SIZE = 128;

const SPEED = 340;
const STOP_DISTANCE = 60;
const WAKE_MARGIN = 28;
const GROOM_FPS = 4;
const GROOM_LOOPS = 2;
const SLEEP_FPS = 1.6;
const REACTION_END_HOLD = 1.0;
const SHAKE_RADIUS = 72;
const SHAKE_DISTANCE = 15;
const SHAKE_HEIGHT = 28;
const SHAKE_WINDOW = 1.1;
const SHAKE_STROKES = 4;
const FLEE_SECONDS = 0.65;
const SAD_SECONDS = 2.5;
const AVOID_SECONDS = 60;
const AVOID_DISTANCE = 175;
const FLEE_SPEED = 440;
const PICK_UP_DELAY = 0.32;
const HELD_OFFSET = 28;
const THROW_GRAVITY = 1350;
const THROW_DROP = 105;
const THROW_MAX_SPEED_X = 840;
const THROW_MAX_SPEED_UP = 490;
const THROW_MAX_SPEED_DOWN = 340;
const LAND_SOFT_DELAY = 0.35;
// Longest time step; a longer one would make the cat jump after a stall
const MAX_STEP = 0.05;
// Nothing moves while the cat sleeps, so it may be woken up less often
const MAX_SLEEP_STEP = 0.5;

function angleDifference(a, b) {
    return Math.abs(((a - b + 180) % 360 + 360) % 360 - 180);
}

export function directionFor(dx, dy) {
    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    let best = DIRECTIONS[0];
    for (const direction of DIRECTIONS) {
        if (angleDifference(angle, direction[0]) < angleDifference(angle, best[0]))
            best = direction;
    }
    return best[1];
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export class CatBrain {
    // size      - size of a sprite on the screen in pixels
    // stopDistance - how far from the pointer the cat sits down, in pixels;
    //             by default it grows with the cat
    // x, y      - where the cat starts
    // boundsAt  - function (x, y) returning {left, top, right, bottom}: the
    //             area the center of the cat may be in on that monitor
    // random    - source of random numbers, replaceable in tests
    constructor({size, stopDistance, x, y, boundsAt, random = Math.random}) {
        // All distances and speeds grow with the cat
        this._k = size / BASE_SIZE;
        this._stopDistance = stopDistance ?? STOP_DISTANCE * this._k;
        this._boundsAt = boundsAt;
        this._random = random;

        this.x = x;
        this.y = y;
        this.state = 'run';
        this.sprite = 'right';
        this.frame = 0;

        this._direction = 'right';
        this._facingLeft = false;
        this._phase = 0;
        this._restTime = 0;
        this._reaction = '';
        this._reactionTime = 0;
        this._lastReaction = '';
        this._avoidTime = 0;
        this._escapeAngle = null;
        this._lastEscapeAngle = null;
        this._pressing = false;
        this._pressTime = 0;
        this._dragX = 0;
        this._dragY = 0;
        this._velocityX = 0;
        this._velocityY = 0;
        this._throwTime = 0;
        this._throwFloor = 0;
        this._resetShake(null);
    }

    // Grooming and sleeping are drawn facing right
    get mirrored() {
        return (this.state === 'groom' || this.state === 'sleep') && this._facingLeft;
    }

    // True while a mouse button pressed on the cat is still down
    get pressing() {
        return this._pressing;
    }

    // Distance at which the cat sits down next to the pointer
    get stopDistance() {
        return this._stopDistance;
    }

    _show(sprite, frame) {
        this.sprite = sprite;
        this.frame = frame;
    }

    _resetShake(cursor) {
        this._shakeOrigin = cursor;
        this._shakeExtreme = cursor ? cursor.x : 0;
        this._shakeDirection = 0;
        this._shakeStrokes = 0;
        this._shakeTime = 0;
    }

    // Four quick horizontal strokes of the pointer next to the cat scare it
    _cursorShook(cursor, distance, dt) {
        if (distance > SHAKE_RADIUS * this._k) {
            this._resetShake(null);
            return false;
        }
        this._shakeTime += dt;
        if (!this._shakeOrigin || this._shakeTime > SHAKE_WINDOW ||
            Math.abs(cursor.y - this._shakeOrigin.y) > SHAKE_HEIGHT * this._k) {
            this._resetShake(cursor);
            return false;
        }

        const displacement = cursor.x - this._shakeExtreme;
        if (this._shakeDirection && displacement * this._shakeDirection >= 0) {
            this._shakeExtreme = cursor.x;
        } else if (Math.abs(displacement) >= SHAKE_DISTANCE * this._k) {
            this._shakeDirection = displacement > 0 ? 1 : -1;
            this._shakeExtreme = cursor.x;
            this._shakeStrokes += 1;
        }
        return this._shakeStrokes >= SHAKE_STROKES;
    }

    // One step away from the pointer. Returns false when there is nowhere to go.
    _flee(cursor, dt) {
        const bounds = this._boundsAt(this.x, this.y);
        const cursorDistance = (this.x - cursor.x) ** 2 + (this.y - cursor.y) ** 2;
        const step = FLEE_SPEED * this._k * dt;
        const options = new Map();
        for (const [angle] of DIRECTIONS) {
            const radians = angle * Math.PI / 180;
            const x = clamp(this.x + step * Math.cos(radians), bounds.left, bounds.right);
            const y = clamp(this.y + step * Math.sin(radians), bounds.top, bounds.bottom);
            const distance = (x - cursor.x) ** 2 + (y - cursor.y) ** 2;
            if (distance > cursorDistance && Math.hypot(x - this.x, y - this.y) > step / 2)
                options.set(angle, {distance, x, y});
        }
        if (!options.size) {
            this._escapeAngle = null;
            return false;
        }

        if (!options.has(this._escapeAngle)) {
            let farthest = -Infinity;
            for (const option of options.values())
                farthest = Math.max(farthest, option.distance);
            const minGain = (farthest - cursorDistance) * 0.35;
            const safe = [];
            for (const [angle, option] of options) {
                if (option.distance - cursorDistance >= minGain)
                    safe.push(angle);
            }
            // Prefer a direction other than the previous one
            const alternatives = this._lastEscapeAngle === null
                ? safe
                : safe.filter(angle => angleDifference(angle, this._lastEscapeAngle) >= 45);
            const choices = alternatives.length ? alternatives : safe;
            this._escapeAngle = choices[Math.floor(this._random() * choices.length)];
            this._lastEscapeAngle = this._escapeAngle;
        }

        const best = options.get(this._escapeAngle);
        this._direction = directionFor(best.x - this.x, best.y - this.y);
        this.x = best.x;
        this.y = best.y;
        this._phase = (this._phase + dt * 15) % 4;
        this._show(this._direction, Math.floor(this._phase));
        return true;
    }

    _followHeldCursor(cursor, dt) {
        if (dt > 0) {
            this._velocityX = this._velocityX * 0.65 + (cursor.x - this._dragX) / dt * 0.35;
            this._velocityY = this._velocityY * 0.65 + (cursor.y - this._dragY) / dt * 0.35;
        }
        this._dragX = cursor.x;
        this._dragY = cursor.y;
        // The cat hangs by the scruff of its neck
        this.x = cursor.x;
        this.y = cursor.y + HELD_OFFSET * this._k;
        const time = Math.max(0, this._pressTime - PICK_UP_DELAY);
        this._show('held', Math.floor(time * 5) % SPRITES.held);
    }

    _updateThrow(dt) {
        this._throwTime += dt;
        if (this.state === 'thrown') {
            const bounds = this._boundsAt(this.x, this.y);
            this._velocityY += THROW_GRAVITY * this._k * dt;
            const nextX = this.x + this._velocityX * dt;
            const nextY = this.y + this._velocityY * dt;
            this.x = clamp(nextX, bounds.left, bounds.right);
            this.y = Math.min(this._throwFloor, Math.max(bounds.top, nextY));
            this._show('tumble', 4 + Math.min(1, Math.floor(this._throwTime * 7)));
            if (nextY >= this._throwFloor && this._velocityY >= 0) {
                this.state = 'landed';
                this._throwTime = 0;
                this._show('tumble', 6);
            }
        } else if (this._throwTime >= LAND_SOFT_DELAY) {
            this.state = 'avoid';
            this._avoidTime = FLEE_SECONDS;
            this._escapeAngle = null;
            this._show('sad', 0);
        } else {
            this._show('tumble', 6 + (this._throwTime >= 0.24 ? 1 : 0));
        }
    }

    // Advances the cat by dt seconds; cursor is {x, y}
    tick(dt, cursor) {
        dt = Math.min(dt, this.state === 'sleep' ? MAX_SLEEP_STEP : MAX_STEP);

        if (this._pressing) {
            this._pressTime += dt;
            if (this._pressTime >= PICK_UP_DELAY) {
                if (this.state !== 'held') {
                    this.state = 'held';
                    this._resetShake(null);
                }
                this._followHeldCursor(cursor, dt);
            }
            return;
        }
        if (this.state === 'thrown' || this.state === 'landed') {
            this._updateThrow(dt);
            return;
        }

        const dx = cursor.x - this.x;
        const dy = cursor.y - this.y;
        const distance = Math.hypot(dx, dy);

        if (this.state !== 'avoid' && this._cursorShook(cursor, distance, dt)) {
            this.state = 'avoid';
            this._avoidTime = 0;
            this._escapeAngle = null;
            this._resetShake(null);
        }

        if (this.state === 'avoid') {
            this._avoidTime += dt;
            const avoidStart = FLEE_SECONDS + SAD_SECONDS;
            if (this._avoidTime < avoidStart + AVOID_SECONDS) {
                const shouldFlee = this._avoidTime < FLEE_SECONDS ||
                    (this._avoidTime >= avoidStart && distance < AVOID_DISTANCE * this._k);
                if (!shouldFlee)
                    this._escapeAngle = null;
                if (!shouldFlee || !this._flee(cursor, dt)) {
                    // The sad cat blinks now and then
                    this._show('sad', this._avoidTime % 2.4 >= 2.25 ? 1 : 0);
                }
                return;
            }
            this.state = 'run';
        }

        if (this.state === 'reaction') {
            this._reactionTime += dt;
            const durations = REACTIONS[this._reaction];
            let remaining = this._reactionTime;
            for (let frame = 0; frame < durations.length; frame++) {
                if (remaining < durations[frame]) {
                    this._show(this._reaction, frame);
                    return;
                }
                remaining -= durations[frame];
            }
            if (remaining < REACTION_END_HOLD) {
                this._show(this._reaction, durations.length - 1);
                return;
            }
            this.state = 'run';
        }

        const stopDistance = this._stopDistance;
        if (this.state !== 'run' && distance > stopDistance + WAKE_MARGIN * this._k)
            this.state = 'run';

        if (this.state === 'run') {
            const remaining = distance - stopDistance;
            const step = Math.min(SPEED * this._k * dt, Math.max(0, remaining));
            if (step > 0) {
                this._direction = directionFor(dx, dy);
                if (Math.abs(dx) > 4 * this._k)
                    this._facingLeft = dx < 0;
                this.x += dx / distance * step;
                this.y += dy / distance * step;
            }

            // Stop on the tick that reaches the target radius. Recomputing
            // the distance on the next tick can leave it just above the limit.
            if (step >= remaining) {
                this.state = 'groom';
                this._restTime = 0;
                this._show('groom', 0);
            } else {
                this._phase = (this._phase + dt * 12) % 4;
                this._show(this._direction, Math.floor(this._phase));
            }
        } else {
            this._restTime += dt;
            const groomDuration = SPRITES.groom * GROOM_LOOPS / GROOM_FPS;
            if (this._restTime >= groomDuration) {
                this.state = 'sleep';
                this._show('sleep',
                    Math.floor((this._restTime - groomDuration) * SLEEP_FPS) % SPRITES.sleep);
            } else {
                this._show(this.state, Math.floor(this._restTime * GROOM_FPS) % SPRITES.groom);
            }
        }
    }

    // The left mouse button went down on the cat
    press(cursor) {
        if (this.state === 'thrown' || this.state === 'landed')
            return;
        this._pressing = true;
        this._pressTime = 0;
        this._dragX = cursor.x;
        this._dragY = cursor.y;
        this._velocityX = 0;
        this._velocityY = 0;
    }

    // The button pressed on the cat was released
    release(cursor) {
        if (!this._pressing)
            return;
        this._pressing = false;

        if (this.state === 'held') {
            // Held long enough to be picked up: throw the cat
            if (cursor.x !== this._dragX || cursor.y !== this._dragY)
                this._followHeldCursor(cursor, 0.016);
            const bounds = this._boundsAt(this.x, this.y);
            this._velocityX = clamp(this._velocityX,
                -THROW_MAX_SPEED_X * this._k, THROW_MAX_SPEED_X * this._k);
            this._velocityY = clamp(this._velocityY,
                -THROW_MAX_SPEED_UP * this._k, THROW_MAX_SPEED_DOWN * this._k);
            this._throwFloor = clamp(this.y + THROW_DROP * this._k, bounds.top, bounds.bottom);
            this._throwTime = 0;
            this.state = 'thrown';
            this._show('tumble', 4);
            return;
        }

        // A short click starts a reaction
        if (this.state === 'avoid')
            return;
        if (this.state === 'reaction') {
            const duration = REACTIONS[this._reaction].reduce((sum, value) => sum + value, 0);
            if (this._reactionTime < duration)
                return;
        }
        const names = Object.keys(REACTIONS).filter(name => name !== this._lastReaction);
        this._reaction = names[Math.floor(this._random() * names.length)];
        this._lastReaction = this._reaction;
        this._reactionTime = 0;
        this.state = 'reaction';
        this._show(this._reaction, 0);
    }
}
