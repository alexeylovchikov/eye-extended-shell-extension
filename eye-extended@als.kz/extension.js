/* extension.js
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

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {CatBrain, SPRITES as CAT_SPRITES} from './catBrain.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

// Clutter.Color was replaced by Cogl.Color in GNOME Shell 47
const ColorClass = Clutter.Color ?? Cogl.Color;

const CLICK_ANIMATION_DURATION = 500;

const BUTTONS_MASK = Clutter.ModifierType.BUTTON1_MASK |
    Clutter.ModifierType.BUTTON2_MASK |
    Clutter.ModifierType.BUTTON3_MASK;

const CIRCLE_KEYS = [
    'mouse-circle-mode',
    'mouse-circle-size',
    'mouse-circle-opacity',
    'mouse-circle-repaint-interval',
    'mouse-circle-enable',
    'mouse-circle-left-click-enable',
    'mouse-circle-right-click-enable',
    'mouse-circle-middle-click-enable',
    'mouse-circle-color',
    'mouse-circle-left-click-color',
    'mouse-circle-right-click-color',
    'mouse-circle-middle-click-color',
];

function parseColor(str) {
    try {
        const [ok, color] = ColorClass.from_string(str);
        if (ok)
            return color;
    } catch (e) {
        logError(e, `Eye Extended: cannot parse color "${str}"`);
    }
    return null;
}

// St scales icon sizes and CSS lengths by this factor on HiDPI screens,
// while actor positions and sizes set from code are in stage pixels.
function getScaleFactor() {
    return St.ThemeContext.get_for_stage(global.stage).scale_factor;
}

function setSourceColor(cr, color) {
    cr.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, color.alpha / 255);
}

// Resolves to an icon with a copy of the shape SVG colored and cached on disk.
// File IO is async so that the shell never blocks on disk access.
async function createShapeIcon(extension, mode, color) {
    const dir = GLib.build_filenamev([
        GLib.get_user_cache_dir(), extension.metadata['gettext-domain'], 'icons',
    ]);
    if (GLib.mkdir_with_parents(dir, 0o755) !== 0)
        throw new Error(`Failed to create cache dir at ${dir}`);

    const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, color, -1);
    const path = GLib.build_filenamev([dir, `${mode}_${hash}.svg`]);
    const dest = Gio.File.new_for_path(path);

    if (!dest.query_exists(null)) {
        const source = Gio.File.new_for_path(
            GLib.build_filenamev([extension.path, 'circle', `${mode}.svg`]));
        const [bytes] = await source.load_contents_async(null);
        const contents = new TextDecoder().decode(bytes)
            .replace('fill="#000000"', `fill="${color}"`);
        await dest.replace_contents_bytes_async(
            new GLib.Bytes(new TextEncoder().encode(contents)), null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    }

    return Gio.icon_new_for_string(path);
}

// Mouse indicator that follows the pointer and highlights clicks
class MouseCircle {
    constructor(extension, settings, onStateChanged) {
        this._extension = extension;
        this._settings = settings;
        this._onStateChanged = onStateChanged;
        this._iconSerial = 0;
        this._defaultIcon = null;

        this._active = false;
        this._pointer = null;
        this._timeoutId = 0;
        this._buttons = 0;
        this._animations = new Set();

        this._loadSettings();
        this._settings.connectObject('changed', (s, key) => {
            if (CIRCLE_KEYS.includes(key))
                this._reload();
        }, this);
    }

    get active() {
        return this._active;
    }

    get color() {
        return this._color;
    }

    // Size of the shape on the stage
    get _pixelSize() {
        return this._size * getScaleFactor();
    }

    setActive(active) {
        if (this._active === active)
            return;
        this._active = active;

        if (active) {
            this._pointer = new St.Icon({
                reactive: false,
                can_focus: false,
                track_hover: false,
            });
            Main.uiGroup.add_child(this._pointer);
            this._updatePointer();
            this._buttons = global.get_pointer()[2] & BUTTONS_MASK;
            this._startTimer();
        } else {
            this._stopTimer();
            this._pointer?.destroy();
            this._pointer = null;
        }

        this._onStateChanged();
    }

    destroy() {
        this._settings.disconnectObject(this);
        // Drop icons that are still being loaded
        this._iconSerial++;
        this._stopTimer();
        this.setActive(false);
        for (const actor of this._animations) {
            actor.remove_all_transitions();
            actor.destroy();
        }
        this._animations.clear();
    }

    _loadSettings() {
        const s = this._settings;
        this._mode = s.get_int('mouse-circle-mode');
        this._size = s.get_int('mouse-circle-size');
        this._opacity = s.get_int('mouse-circle-opacity');
        this._interval = Math.max(1, s.get_int('mouse-circle-repaint-interval'));
        this._enabled = s.get_boolean('mouse-circle-enable');
        this._color = s.get_string('mouse-circle-color');
        // X11 reports the middle button as BUTTON2 and the right one as
        // BUTTON3; mutter's own Wayland backend has them the other way round
        const wayland = Meta.is_wayland_compositor();
        const middleMask = wayland
            ? Clutter.ModifierType.BUTTON3_MASK : Clutter.ModifierType.BUTTON2_MASK;
        const rightMask = wayland
            ? Clutter.ModifierType.BUTTON2_MASK : Clutter.ModifierType.BUTTON3_MASK;
        this._clicks = {
            [Clutter.ModifierType.BUTTON1_MASK]: {
                enabled: s.get_boolean('mouse-circle-left-click-enable'),
                color: s.get_string('mouse-circle-left-click-color'),
            },
            [middleMask]: {
                enabled: s.get_boolean('mouse-circle-middle-click-enable'),
                color: s.get_string('mouse-circle-middle-click-color'),
            },
            [rightMask]: {
                enabled: s.get_boolean('mouse-circle-right-click-enable'),
                color: s.get_string('mouse-circle-right-click-color'),
            },
        };

        this._loadIcons().catch(e => logError(e, 'Eye Extended: cannot load mouse indicator shape'));
    }

    async _loadIcons() {
        const serial = ++this._iconSerial;
        const clicks = Object.values(this._clicks);
        const [defaultIcon, ...clickIcons] = await Promise.all(
            [this._color, ...clicks.map(click => click.color)]
                .map(color => createShapeIcon(this._extension, this._mode, color)));

        // Settings changed or the extension was disabled while loading
        if (serial !== this._iconSerial)
            return;

        this._defaultIcon = defaultIcon;
        clicks.forEach((click, i) => (click.icon = clickIcons[i]));
        if (this._pointer)
            this._pointer.gicon = defaultIcon;
    }

    _reload() {
        this._loadSettings();
        if (!this._active)
            return;

        this._updatePointer();
        this._stopTimer();
        this._startTimer();
        this._onStateChanged();
    }

    _updatePointer() {
        if (!this._pointer)
            return;

        this._pointer.icon_size = this._size;
        this._pointer.opacity = this._opacity;
        this._pointer.gicon = this._defaultIcon;
        this._pointer.visible = this._enabled;
        this._movePointer();
    }

    _movePointer() {
        if (!this._pointer)
            return;
        const [x, y] = global.get_pointer();
        const half = this._pixelSize / 2;
        this._pointer.set_position(x - half, y - half);
    }

    _startTimer() {
        if (this._timeoutId)
            return;

        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._interval, () => {
            this._poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    // On Wayland mutter forwards clicks on client windows straight to the
    // client, so neither Clutter event filters nor AT-SPI see them. Polling
    // the pointer button state works for windows, the shell UI and on X11.
    _poll() {
        const [x, y, mods] = global.get_pointer();
        if (this._pointer && this._enabled) {
            const half = this._pixelSize / 2;
            this._pointer.set_position(x - half, y - half);
        }

        const buttons = mods & BUTTONS_MASK;
        const pressed = buttons & ~this._buttons;
        this._buttons = buttons;
        if (!pressed)
            return;

        for (const [mask, click] of Object.entries(this._clicks)) {
            if (pressed & Number(mask))
                this._onClick(click, x, y);
        }
    }

    _stopTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    _onClick(click, x, y) {
        if (!click.enabled)
            return;

        const scale = this._size > 20 ? 1.5 : 3;
        const pixelSize = this._pixelSize;

        // The shape is still being loaded
        if (!click.icon)
            return;

        if (this._pointer)
            this._pointer.gicon = click.icon;

        const actor = new St.Icon({
            x: x - pixelSize / 2,
            y: y - pixelSize / 2,
            reactive: false,
            can_focus: false,
            track_hover: false,
            icon_size: this._size,
            opacity: this._opacity,
            gicon: click.icon,
        });
        Main.uiGroup.add_child(actor);
        this._animations.add(actor);

        actor.ease({
            x: x - pixelSize * scale / 2,
            y: y - pixelSize * scale / 2,
            scale_x: scale,
            scale_y: scale,
            opacity: 0,
            duration: CLICK_ANIMATION_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!this._animations.delete(actor))
                    return;
                actor.destroy();
                if (this._pointer)
                    this._pointer.gicon = this._defaultIcon;
            },
        });
    }
}

const TRAIL_KEYS = [
    'water-ripple-enable',
    'water-ripple-trigger',
    'water-ripple-effect',
    'water-ripple-line-width',
    'water-ripple-mode',
    'water-ripple-size',
    'water-ripple-duration',
    'water-ripple-color',
];
const TRAIL_POLL_INTERVAL = 16;
const TRAIL_MAX_ACTORS = 150;
const TRAIL_MAX_POINTS = 2000;
// Ripples start at the set size, like the mouse indicator, and spread out
const RIPPLE_END_SCALE = 2;
const SPARKLES_PER_STEP = 3;
// Length of the straight pieces a smoothed line is drawn with, in pixels
const LINE_STEP = 4;
const LINE_MAX_STEPS = 24;
// A long line is drawn with longer pieces to keep repainting fast
const LINE_MAX_SAMPLES = 600;
// Pause between repaints of the line, in multiples of the time one takes
const LINE_REPAINT_PAUSE = 3;
// Number of steps the line fades and thins in
const LINE_SHADES = 48;

// Turns the polled pointer positions of one stroke into a smooth curve:
// corners are rounded with quadratic Bezier curves between the midpoints of
// neighbouring segments. Returns closely spaced {x, y, t} samples, so that
// the color and the width of the line can change gradually along it.
function smoothStroke(points) {
    const n = points.length;
    if (n < 3)
        return points;

    let total = 0;
    for (let i = 1; i < n; i++)
        total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const step = Math.max(LINE_STEP, total / LINE_MAX_SAMPLES);

    const mid = (a, b) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: (a.t + b.t) / 2});
    const samples = [points[0]];
    const addCurve = (from, ctrl, to) => {
        const length = Math.hypot(ctrl.x - from.x, ctrl.y - from.y) +
            Math.hypot(to.x - ctrl.x, to.y - ctrl.y);
        const steps = Math.min(LINE_MAX_STEPS, Math.max(1, Math.ceil(length / step)));
        for (let i = 1; i <= steps; i++) {
            const u = i / steps;
            const a = (1 - u) * (1 - u);
            const b = 2 * u * (1 - u);
            const c = u * u;
            samples.push({
                x: a * from.x + b * ctrl.x + c * to.x,
                y: a * from.y + b * ctrl.y + c * to.y,
                t: a * from.t + b * ctrl.t + c * to.t,
            });
        }
    };

    // Straight from the first point to the first midpoint
    let from = mid(points[0], points[1]);
    addCurve(points[0], mid(points[0], from), from);
    for (let i = 1; i < n - 1; i++) {
        const to = mid(points[i], points[i + 1]);
        addCurve(from, points[i], to);
        from = to;
    }
    addCurve(from, mid(from, points[n - 1]), points[n - 1]);
    return samples;
}

// Animation behind the pointer, always or only while Ctrl is held: water ripples,
// a fading laser-pointer line, a comet tail or sparkles
class PointerTrail {
    constructor(extension, settings) {
        this._extension = extension;
        this._settings = settings;
        this._timeoutId = 0;
        this._actors = new Set();
        this._points = [];
        this._area = null;
        this._nextRepaint = 0;
        this._lastX = undefined;
        this._lastY = undefined;
        this._iconSerial = 0;

        this._loadSettings();
        this._settings.connectObject('changed', (s, key) => {
            if (TRAIL_KEYS.includes(key))
                this._loadSettings();
        }, this);
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._iconSerial++;
        this._stopTimer();
        this._clear();
    }

    _loadSettings() {
        const s = this._settings;
        this._enabled = s.get_boolean('water-ripple-enable');
        this._always = s.get_string('water-ripple-trigger') === 'always';
        this._effect = s.get_string('water-ripple-effect');
        this._lineWidth = s.get_double('water-ripple-line-width');
        this._size = s.get_int('water-ripple-size');
        this._duration = s.get_int('water-ripple-duration');
        this._color = s.get_string('water-ripple-color');
        this._rgba = parseColor(this._color);
        this._mode = s.get_int('water-ripple-mode');
        // Plain rings and dots are used until the shape is loaded
        this._icon = null;
        const serial = ++this._iconSerial;
        if (this._mode > 0 && this._effect !== 'line') {
            createShapeIcon(this._extension, this._mode, this._color).then(icon => {
                if (serial === this._iconSerial)
                    this._icon = icon;
            }).catch(e => logError(e, `Eye Extended: cannot load trail shape ${this._mode}`));
        }

        // Distance the pointer has to move before the next piece is added
        this._spacing = ({
            ripples: Math.max(4, this._size / 4),
            comet: Math.max(4, this._size / 4),
            sparkles: Math.max(4, this._size / 3),
        }[this._effect] ?? 2) * getScaleFactor();

        // Do not mix pieces of the old and the new effect
        this._clear();
        if (this._enabled)
            this._startTimer();
        else
            this._stopTimer();
    }

    _startTimer() {
        if (this._timeoutId)
            return;
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TRAIL_POLL_INTERVAL, () => {
            this._poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    _clear() {
        for (const actor of this._actors) {
            actor.remove_all_transitions();
            actor.destroy();
        }
        this._actors.clear();
        this._points = [];
        this._destroyArea();
        this._lastX = undefined;
    }

    // Keyboard modifiers are polled for the same reason as mouse buttons:
    // on Wayland the shell does not see input sent to client windows.
    _poll() {
        const [x, y, mods] = global.get_pointer();
        const active = this._always ||
            (mods & Clutter.ModifierType.CONTROL_MASK) !== 0;

        if (this._effect === 'line') {
            this._pollLine(x, y, active);
            return;
        }

        if (!active) {
            this._lastX = undefined;
            return;
        }

        if (this._lastX === undefined) {
            this._lastX = x;
            this._lastY = y;
            return;
        }

        const dx = x - this._lastX;
        const dy = y - this._lastY;
        if (dx * dx + dy * dy < this._spacing * this._spacing)
            return;

        this._lastX = x;
        this._lastY = y;

        if (this._effect === 'comet')
            this._spawnComet(x, y);
        else if (this._effect === 'sparkles')
            this._spawnSparkles(x, y);
        else
            this._spawnRipple(x, y);
    }

    // A shape centered at (x, y): the selected SVG, a ring or a dot
    _addActor(x, y, size, filled) {
        if (this._actors.size >= TRAIL_MAX_ACTORS)
            return null;

        // The actor box is in stage pixels; icon_size and CSS are scaled by St
        const pixelSize = size * getScaleFactor();
        const params = {
            x: x - pixelSize / 2,
            y: y - pixelSize / 2,
            width: pixelSize,
            height: pixelSize,
            reactive: false,
            can_focus: false,
            track_hover: false,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        };
        const radius = `border-radius: ${size / 2}px;`;
        let actor;
        if (this._icon)
            actor = new St.Icon({...params, gicon: this._icon, icon_size: size});
        else if (filled)
            actor = new St.Widget({...params, style: `background-color: ${this._color}; ${radius}`});
        else
            actor = new St.Widget({...params, style: `border: ${this._lineWidth}px solid ${this._color}; ${radius}`});

        Main.uiGroup.add_child(actor);
        this._actors.add(actor);
        return actor;
    }

    _fade(actor, props, mode = Clutter.AnimationMode.EASE_OUT_CUBIC) {
        actor.ease({
            ...props,
            opacity: 0,
            duration: this._duration,
            mode,
            onComplete: () => {
                if (this._actors.delete(actor))
                    actor.destroy();
            },
        });
    }

    _spawnRipple(x, y) {
        const actor = this._addActor(x, y, this._size, false);
        if (actor)
            this._fade(actor, {scale_x: RIPPLE_END_SCALE, scale_y: RIPPLE_END_SCALE});
    }

    // Dots along the path that shrink away
    _spawnComet(x, y) {
        const actor = this._addActor(x, y, this._size, true);
        if (actor)
            this._fade(actor, {scale_x: 0, scale_y: 0}, Clutter.AnimationMode.EASE_IN_QUAD);
    }

    // Pieces that scatter around the pointer and shrink
    _spawnSparkles(x, y) {
        for (let i = 0; i < SPARKLES_PER_STEP; i++) {
            const actor = this._addActor(x, y, this._size, true);
            if (!actor)
                return;
            const angle = Math.random() * 2 * Math.PI;
            const distance = this._size * getScaleFactor() * (0.4 + Math.random() * 0.6);
            this._fade(actor, {
                translation_x: Math.cos(angle) * distance,
                translation_y: Math.sin(angle) * distance,
                scale_x: 0.3,
                scale_y: 0.3,
                rotation_angle_z: (Math.random() - 0.5) * 360,
            }, Clutter.AnimationMode.EASE_OUT_QUAD);
        }
    }

    // Laser pointer: a line through recent pointer positions that fades
    // and thins with age
    _pollLine(x, y, active) {
        const now = GLib.get_monotonic_time() / 1000;

        if (active) {
            const start = this._lastX === undefined;
            const dx = x - this._lastX;
            const dy = y - this._lastY;
            if (start || dx * dx + dy * dy >= this._spacing * this._spacing) {
                this._points.push({x, y, t: now, start});
                this._lastX = x;
                this._lastY = y;
            }
        } else {
            this._lastX = undefined;
        }

        while (this._points.length &&
            (now - this._points[0].t > this._duration || this._points.length > TRAIL_MAX_POINTS))
            this._points.shift();

        if (this._points.length) {
            if (!this._area) {
                this._area = new St.DrawingArea({reactive: false});
                this._areaRepaintId = this._area.connect('repaint', area => this._drawLine(area));
                Main.uiGroup.add_child(this._area);
            }
            // A very long line takes a while to draw: repaint it less
            // often rather than keep the shell busy with nothing else
            if (now >= this._nextRepaint) {
                this._layoutArea();
                this._area.queue_repaint();
            }
        } else {
            this._destroyArea();
        }
    }

    // Keep the drawing area just around the line: repainting a surface
    // the size of the whole stage is slow with several monitors
    _layoutArea() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of this._points) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
        const pad = Math.ceil(this._lineWidth * getScaleFactor()) + 2;
        this._areaX = Math.floor(minX - pad);
        this._areaY = Math.floor(minY - pad);
        this._area.set_position(this._areaX, this._areaY);
        this._area.set_size(
            Math.ceil(maxX + pad) - this._areaX,
            Math.ceil(maxY + pad) - this._areaY);
    }

    _destroyArea() {
        if (!this._area)
            return;
        this._area.disconnect(this._areaRepaintId);
        this._area.destroy();
        this._area = null;
    }

    _drawLine(area) {
        const cr = area.get_context();
        const now = GLib.get_monotonic_time() / 1000;
        const c = this._rgba;
        const [r, g, b, a] = c
            ? [c.red / 255, c.green / 255, c.blue / 255, c.alpha / 255]
            : [1, 0, 0, 1];

        const lineWidth = this._lineWidth * getScaleFactor();
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        // Segments are translucent and their round caps overlap: replace the
        // pixels instead of blending them, or every joint shows up as a dot
        cr.setOperator(Cairo.Operator.SOURCE);
        // Points are in stage coordinates, the area starts at its own origin
        cr.translate(-this._areaX, -this._areaY);
        // Split the points into strokes: a new one starts each time the
        // trail is triggered again
        let stroke = [];
        const strokes = [stroke];
        for (const p of this._points) {
            if (p.start && stroke.length) {
                stroke = [];
                strokes.push(stroke);
            }
            stroke.push(p);
        }

        for (const points of strokes) {
            const samples = smoothStroke(points);
            // Stroking every piece on its own is far too slow for a long
            // line: pieces of the same shade are drawn as one path
            let shade = 0;
            for (let i = 1; i < samples.length; i++) {
                const life = 1 - (now - samples[i].t) / this._duration;
                const next = life > 0 ? Math.ceil(life * LINE_SHADES) : 0;
                if (next !== shade) {
                    if (shade)
                        cr.stroke();
                    shade = next;
                    if (shade) {
                        const level = shade / LINE_SHADES;
                        cr.setSourceRGBA(r, g, b, a * level);
                        cr.setLineWidth(lineWidth * (0.3 + 0.7 * level));
                        cr.moveTo(samples[i - 1].x, samples[i - 1].y);
                    }
                }
                if (shade)
                    cr.lineTo(samples[i].x, samples[i].y);
            }
            if (shade)
                cr.stroke();
        }

        // Spend at most a quarter of the time on drawing the line
        const end = GLib.get_monotonic_time() / 1000;
        this._nextRepaint = end + (end - now) * LINE_REPAINT_PAUSE;

        cr.$dispose();
    }
}

// Eye in the top panel
const CAT_KEYS = ['cat-enable', 'cat-size', 'cat-stop-distance'];
const CAT_INTERVAL = 16;
// A sleeping cat only has to notice that the pointer went away
const CAT_SLEEP_INTERVAL = 100;
// The part of the sprite that takes clicks, so that clicks next to the cat
// still reach the window under it
const CAT_HIT_SIZE = 0.4;

// A cat that runs after the pointer, grooms itself and falls asleep next to
// it, reacts to clicks and can be picked up and thrown. How it behaves is
// decided in catBrain.js; this class only shows it on the stage.
class DesktopCat {
    constructor(extension, settings) {
        this._extension = extension;
        this._settings = settings;
        this._timeoutId = 0;
        this._interval = 0;
        this._actor = null;
        this._hit = null;
        this._brain = null;

        this._settings.connectObject('changed', (s, key) => {
            if (CAT_KEYS.includes(key))
                this._reload();
        }, this);
        this._reload();
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._stop();
    }

    _reload() {
        this._stop();
        if (!this._settings.get_boolean('cat-enable'))
            return;
        // The cat is a toy: it must never take the eye down with it
        try {
            this._start();
        } catch (e) {
            logError(e, 'Eye Extended: cannot show the cat');
            this._stop();
        }
    }

    _start() {
        const size = this._settings.get_int('cat-size');
        // The actor box is in stage pixels; icon_size is scaled by St
        this._pixelSize = size * getScaleFactor();

        this._actor = new St.Widget({
            width: this._pixelSize,
            height: this._pixelSize,
            layout_manager: new Clutter.BinLayout(),
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
            reactive: false,
            can_focus: false,
            track_hover: false,
        });
        Main.uiGroup.add_child(this._actor);

        // Every frame is its own actor. The hidden ones are transparent
        // rather than hidden, so that their images are loaded in advance
        // and a new frame never shows up empty.
        const dir = this._extension.dir.get_child('cat');
        this._frames = {};
        for (const [name, count] of Object.entries(CAT_SPRITES)) {
            this._frames[name] = [];
            for (let i = 0; i < count; i++) {
                const icon = new St.Icon({
                    gicon: new Gio.FileIcon({file: dir.get_child(`${name}-${i}.png`)}),
                    icon_size: size,
                    opacity: 0,
                });
                this._actor.add_child(icon);
                this._frames[name].push(icon);
            }
        }
        this._shownFrame = null;

        const hitSize = Math.round(this._pixelSize * CAT_HIT_SIZE);
        this._hit = new St.Widget({
            width: hitSize,
            height: hitSize,
            reactive: true,
        });
        this._hitPressId = this._hit.connect('button-press-event',
            (actor, event) => this._onPress(event));
        Main.layoutManager.addChrome(this._hit, {affectsInputRegion: true});

        const start = this._boundsAt();
        this._brain = new CatBrain({
            size: this._pixelSize,
            stopDistance: this._settings.get_int('cat-stop-distance') * getScaleFactor(),
            x: (start.left + start.right) / 2,
            y: (start.top + start.bottom) / 2,
            boundsAt: (x, y) => this._boundsAt(x, y),
        });

        this._lastTime = GLib.get_monotonic_time();
        this._tick();
        this._schedule(CAT_INTERVAL);
    }

    _stop() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        this._interval = 0;
        if (this._hit) {
            this._hit.disconnect(this._hitPressId);
            Main.layoutManager.removeChrome(this._hit);
            this._hit.destroy();
            this._hit = null;
        }
        this._actor?.destroy();
        this._actor = null;
        this._frames = null;
        this._shownFrame = null;
        this._brain = null;
    }

    // Where the center of the cat may be on the monitor that contains the
    // point, or on the primary monitor
    _boundsAt(x, y) {
        const layout = Main.layoutManager;
        const monitor = layout.monitors.find(m =>
            x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) ??
            layout.primaryMonitor ?? layout.monitors[0];
        const area = layout.getWorkAreaForMonitor(monitor.index);
        const half = this._pixelSize / 2;
        return {
            left: area.x + half,
            top: area.y + half,
            right: Math.max(area.x + half, area.x + area.width - half),
            bottom: Math.max(area.y + half, area.y + area.height - half),
        };
    }

    _schedule(interval) {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._interval = interval;
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
            this._tick();
            const wanted = this._brain.state === 'sleep' && !this._brain.pressing
                ? CAT_SLEEP_INTERVAL
                : CAT_INTERVAL;
            if (wanted === this._interval)
                return GLib.SOURCE_CONTINUE;

            // Replace this source with one that runs at the new pace
            this._timeoutId = 0;
            this._schedule(wanted);
            return GLib.SOURCE_REMOVE;
        });
    }

    _tick() {
        const now = GLib.get_monotonic_time();
        const dt = (now - this._lastTime) / 1000000;
        this._lastTime = now;

        const [x, y, mods] = global.get_pointer();
        const cursor = {x, y};
        // The press comes as an event on the cat; the release is polled,
        // because by then the pointer may be anywhere on the screen
        if (this._brain.pressing && !(mods & Clutter.ModifierType.BUTTON1_MASK))
            this._brain.release(cursor);
        this._brain.tick(dt, cursor);
        this._sync();
    }

    _onPress(event) {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        this._brain.press({x, y});
        // Wake up at once: a click can be over before a sleepy tick comes
        if (this._interval !== CAT_INTERVAL) {
            this._lastTime = GLib.get_monotonic_time();
            this._schedule(CAT_INTERVAL);
        }
        return Clutter.EVENT_STOP;
    }

    // Moves the actors to where the brain says the cat is
    _sync() {
        const brain = this._brain;
        const half = this._pixelSize / 2;
        const x = Math.round(brain.x - half);
        const y = Math.round(brain.y - half);
        if (x !== this._actor.x || y !== this._actor.y) {
            this._actor.set_position(x, y);
            const hitHalf = this._hit.width / 2;
            this._hit.set_position(Math.round(brain.x - hitHalf), Math.round(brain.y - hitHalf));
        }

        const frame = this._frames[brain.sprite][brain.frame];
        if (frame !== this._shownFrame) {
            if (this._shownFrame)
                this._shownFrame.opacity = 0;
            frame.opacity = 255;
            this._shownFrame = frame;
        }

        const scaleX = brain.mirrored ? -1 : 1;
        if (this._actor.scale_x !== scaleX)
            this._actor.scale_x = scaleX;
    }
}

const EYE_MODES = ['bulb', 'lids', 'cat', 'pair', 'cartoon', 'robot', 'crosshair'];
const EYE_KEYS = [
    'eye-mode',
    'eye-size',
    'eye-line-width',
    'eye-margin',
    'eye-repaint-interval',
    'eye-blink',
    'eye-blink-on-click',
    'eye-pupil-distance',
    'eye-sleepy',
    'mouse-circle-color-eye',
];
// A click can be shorter than the refresh interval of the eye
const EYE_CLICK_POLL_INTERVAL = 30;
const EYE_ANIMATION_INTERVAL = 16;
const BLINK_DURATION = 220;
const BLINK_MIN_PAUSE = 3000;
const BLINK_MAX_PAUSE = 8000;
// The eye half closes after the mouse has been still for this long
const SLEEP_DELAY = 30000;
const SLEEP_LEVEL = 0.55;
const SLEEP_TRANSITION = 400;
// Distance in pixels from which the pupil starts to grow
const PUPIL_FAR = 600;
// Gap between the two eyes of a pair, as a part of the eye size
const PAIR_GAP = 0.1;

// Width of the box an eye of the given height is drawn in
function eyeBoxWidth(mode, size) {
    if (mode === 'lids' || mode === 'cat')
        return size * 1.5;
    if (mode === 'pair')
        return size * (2 + PAIR_GAP);
    return size;
}

// Draws one eye around the current origin of the Cairo context.
//   eyeRad    - radius of the eye
//   dx, dy    - where the pointer is, relative to the center of the eye
//   lineWidth - width of the outline
//   lid       - how far the eye is open, from 0 (closed) to 1
//   near      - how close the pointer is, from 0 (far) to 1; widens the pupil
function drawEye(cr, style, {eyeRad, dx, dy, lineWidth, lid = 1, near = 0}) {
    if (!(eyeRad > 0))
        return;

    const ang = Math.atan2(dy, dx);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const full = 2 * Math.PI;

    cr.save();
    cr.setLineWidth(lineWidth);

    if (style === 'robot' || style === 'crosshair' || style === 'cartoon') {
        drawFlatEye(cr, style, {eyeRad, ang, dist, lineWidth, lid, near});
        cr.restore();
        return;
    }

    const almond = style === 'lids' || style === 'cat';
    const irisRad = eyeRad * (almond ? 0.5 : 0.6);
    const pupilRad = irisRad * 0.4 * (1 + 0.5 * near);
    // How far the iris can move from the center
    let maxRad = almond
        ? eyeRad * (Math.pow(Math.cos(ang), 4) * 0.5 + 0.25)
        : eyeRad * Math.cos(Math.asin(irisRad / eyeRad)) - lineWidth;
    // A thick outline on a small eye leaves no room to move
    maxRad = Math.max(0, maxRad);

    const irisR = eyeRad * Math.cos(Math.asin(irisRad / eyeRad));
    const eyeAng = Math.atan(Math.min(dist, maxRad) / irisR);

    if (almond) {
        const xDef = irisRad * Math.cos(ang) * Math.sin(eyeAng);
        const yDef = irisRad * Math.sin(ang) * Math.sin(eyeAng);
        // Cairo's y axis points down: the first curve is the lower lid.
        // Both lids flatten into a line as the eye closes.
        const lowerY = (yDef + eyeRad * 0.8) * lid;
        const upperY = (yDef - eyeRad * 0.6) * lid;

        const lidsPath = () => {
            cr.moveTo(-eyeRad, 0);
            cr.curveTo(xDef - irisRad, lowerY, xDef + irisRad, lowerY, eyeRad, 0);
            cr.curveTo(xDef + irisRad, upperY, xDef - irisRad, upperY, -eyeRad, 0);
        };

        lidsPath();
        cr.stroke();
        lidsPath();
        cr.clip();
    } else {
        cr.arc(0, 0, eyeRad, 0, full);
        cr.stroke();
        if (lid < 1) {
            // Both lids close towards the middle of a round eye
            const y = eyeRad * lid;
            const half = Math.sqrt(Math.max(0, eyeRad * eyeRad - y * y));
            for (const side of lid > 0 ? [-1, 1] : [1]) {
                cr.moveTo(-half, side * y);
                cr.lineTo(half, side * y);
                cr.stroke();
            }
            cr.rectangle(-eyeRad, -y, 2 * eyeRad, 2 * y);
            cr.clip();
        }
    }

    // The iris is a circle on a ball, seen from the side
    cr.save();
    cr.rotate(ang);
    cr.setLineWidth(lineWidth / irisRad);

    cr.translate(irisR * Math.sin(eyeAng), 0);
    cr.scale(irisRad * Math.cos(eyeAng), irisRad);
    cr.arc(0, 0, 1.0, 0, full);
    cr.stroke();
    cr.scale(1 / (irisRad * Math.cos(eyeAng)), 1 / irisRad);
    cr.translate(-irisR * Math.sin(eyeAng), 0);

    if (style !== 'cat') {
        cr.translate(eyeRad * Math.sin(eyeAng), 0);
        cr.scale(pupilRad * Math.cos(eyeAng), pupilRad);
        cr.arc(0, 0, 1.0, 0, full);
        cr.fill();
    }
    cr.restore();

    if (style === 'cat') {
        // A slit that stays upright and widens when the pointer is close
        const shift = eyeRad * Math.sin(eyeAng);
        cr.save();
        cr.translate(shift * Math.cos(ang), shift * Math.sin(ang));
        cr.scale(irisRad * (0.2 + 0.3 * near), irisRad * 0.95);
        cr.arc(0, 0, 1.0, 0, full);
        cr.fill();
        cr.restore();
    }

    cr.restore();
}

// Eyes without perspective: a cartoon eye, a camera lens and a crosshair
function drawFlatEye(cr, style, {eyeRad, ang, dist, lineWidth, lid, near}) {
    const full = 2 * Math.PI;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    // Thinner lines for the details, so that a small eye stays readable
    const thin = Math.max(1, lineWidth * 0.6);

    if (style === 'cartoon') {
        cr.arc(0, 0, eyeRad, 0, full);
        cr.stroke();
        if (lid < 1) {
            const y = eyeRad * lid;
            const half = Math.sqrt(Math.max(0, eyeRad * eyeRad - y * y));
            for (const side of lid > 0 ? [-1, 1] : [1]) {
                cr.moveTo(-half, side * y);
                cr.lineTo(half, side * y);
                cr.stroke();
            }
            cr.rectangle(-eyeRad, -y, 2 * eyeRad, 2 * y);
            cr.clip();
        }

        // A big pupil with a highlight cut out of it
        const inner = eyeRad - lineWidth / 2;
        const pupilRad = Math.min(inner * (0.6 + 0.15 * near), inner * 0.85);
        const shift = Math.min(dist, Math.max(0, inner - pupilRad - thin / 2));
        const x = shift * cos;
        const y = shift * sin;
        const glintRad = pupilRad * 0.34;
        cr.setFillRule(Cairo.FillRule.EVEN_ODD);
        cr.arc(x, y, pupilRad, 0, full);
        cr.moveTo(x - pupilRad * 0.36 + glintRad, y - pupilRad * 0.36);
        cr.arc(x - pupilRad * 0.36, y - pupilRad * 0.36, glintRad, 0, full);
        cr.fill();
        return;
    }

    if (style === 'robot') {
        // A lens: the aperture ring closes instead of a lid
        const inner = eyeRad - lineWidth / 2;
        const ringRad = inner * 0.62 * (0.35 + 0.65 * lid);
        const dotRad = Math.max(1, inner * (0.22 + 0.12 * near)) * (0.4 + 0.6 * lid);
        const shift = Math.min(dist, inner * 0.3);
        cr.arc(0, 0, eyeRad, 0, full);
        cr.stroke();
        cr.setLineWidth(thin);
        cr.arc(shift * 0.5 * cos, shift * 0.5 * sin, ringRad, 0, full);
        cr.stroke();
        cr.arc(shift * cos, shift * sin, dotRad, 0, full);
        cr.fill();
        return;
    }

    // Crosshair: a ring with four ticks and a dot that aims at the pointer
    const ringRad = eyeRad * 0.72;
    const dotRad = Math.max(1, eyeRad * (0.2 + 0.1 * near)) * (0.3 + 0.7 * lid);
    const shift = Math.min(dist, ringRad * 0.45);
    cr.setLineWidth(thin);
    cr.arc(0, 0, ringRad, 0, full);
    cr.stroke();
    for (const [tx, ty] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        cr.moveTo(tx * eyeRad * 0.55, ty * eyeRad * 0.55);
        cr.lineTo(tx * (eyeRad + lineWidth / 2), ty * (eyeRad + lineWidth / 2));
        cr.stroke();
    }
    cr.arc(shift * cos, shift * sin, dotRad, 0, full);
    cr.fill();
}

const EyeIndicator = GObject.registerClass(
class EyeIndicator extends PanelMenu.Button {
    _init(extension, settings, circle) {
        super._init(0.5, extension.metadata.name, false);

        this._settings = settings;
        this._circle = circle;
        this._timeoutId = 0;
        this._animationId = 0;
        this._lastX = undefined;
        this._lastY = undefined;

        this._area = new St.DrawingArea({
            y_expand: true,
            y_align: Clutter.ActorAlign.FILL,
        });
        this._area.connect('repaint', area => this._draw(area));
        this.add_child(this._area);

        this._trailItem = new PopupMenu.PopupSwitchMenuItem(_('Pointer trail'),
            this._settings.get_boolean('water-ripple-enable'));
        this._trailItem.connect('toggled', (item, state) => {
            if (this._settings.get_boolean('water-ripple-enable') !== state)
                this._settings.set_boolean('water-ripple-enable', state);
        });
        this._circleItem = new PopupMenu.PopupSwitchMenuItem(_('Mouse indicator'),
            this._circle.active);
        this._circleItem.connect('toggled', (item, state) => this._circle.setActive(state));
        this.menu.addMenuItem(this._circleItem);
        this.menu.addMenuItem(this._trailItem);
        this._syncTrailLabel();
        this._catItem = new PopupMenu.PopupSwitchMenuItem(_('Cat'),
            this._settings.get_boolean('cat-enable'));
        this._catItem.connect('toggled', (item, state) => {
            if (this._settings.get_boolean('cat-enable') !== state)
                this._settings.set_boolean('cat-enable', state);
        });
        this.menu.addMenuItem(this._catItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsItem.connect('activate', () => extension.openPreferences());
        this.menu.addMenuItem(settingsItem);

        this._loadSettings();
        this._startTimer();

        this._settings.connectObject(
            'changed', (settings, key) => {
                if (!EYE_KEYS.includes(key))
                    return;
                this._loadSettings();
                this._stopTimer();
                this._startTimer();
            },
            'changed::water-ripple-enable', () => this._trailItem.setToggleState(
                this._settings.get_boolean('water-ripple-enable')),
            'changed::water-ripple-trigger', () => this._syncTrailLabel(),
            'changed::cat-enable', () => this._catItem.setToggleState(
                this._settings.get_boolean('cat-enable')),
            this);

        St.ThemeContext.get_for_stage(global.stage).connectObject(
            'notify::scale-factor', () => this._loadSettings(), this);

        // Also covers the actor being destroyed by the shell itself
        this.connect('destroy', () => this._stopTimer());
    }

    destroy() {
        this._stopTimer();
        super.destroy();
    }

    // Tell in the menu that the trail needs Ctrl, when it is set up that way
    _syncTrailLabel() {
        this._trailItem.label.text = this._settings.get_string('water-ripple-trigger') === 'always'
            ? _('Pointer trail')
            : _('Pointer trail (hold Ctrl)');
    }

    // The mouse indicator was turned on or off, or changed its color
    circleChanged() {
        this._circleItem.setToggleState(this._circle.active);
        this._area.queue_repaint();
    }

    _loadSettings() {
        const s = this._settings;
        const mode = s.get_string('eye-mode');
        this._mode = EYE_MODES.includes(mode) ? mode : 'bulb';
        this._colorEye = s.get_boolean('mouse-circle-color-eye');
        this._blinkEnabled = s.get_boolean('eye-blink');
        this._blinkOnClick = s.get_boolean('eye-blink-on-click');
        this._pupilDistance = s.get_boolean('eye-pupil-distance');
        this._sleepy = s.get_boolean('eye-sleepy');
        // Sizes are set in logical pixels, the panel is laid out in stage pixels
        this._scale = getScaleFactor();
        this._size = s.get_int('eye-size') * this._scale;
        this._lineWidth = s.get_double('eye-line-width') * this._scale;
        this._margin = s.get_double('eye-margin') * this._scale;
        this._interval = Math.max(1, s.get_int('eye-repaint-interval'));

        // Start with an open eye that has just seen the mouse move
        const now = GLib.get_monotonic_time() / 1000;
        this._blinkStart = 0;
        this._nextBlink = now + this._blinkPause();
        this._sleepLevel = 1;
        this._sleepTarget = 1;
        this._lastMove = now;
        this._buttons = global.get_pointer()[2] & BUTTONS_MASK;

        // The eye is drawn inside a fixed box; the margin only adds space on
        // the sides, so it never changes the panel button height.
        this._boxWidth = eyeBoxWidth(this._mode, this._size);
        this._area.set_width(Math.round(this._boxWidth + 2 * this._margin));
        this._area.queue_repaint();
    }

    _blinkPause() {
        return BLINK_MIN_PAUSE + Math.random() * (BLINK_MAX_PAUSE - BLINK_MIN_PAUSE);
    }

    _startTimer() {
        const interval = this._blinkOnClick
            ? Math.min(this._interval, EYE_CLICK_POLL_INTERVAL)
            : this._interval;
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
            this._poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._animationId) {
            GLib.source_remove(this._animationId);
            this._animationId = 0;
        }
    }

    _poll() {
        // Nothing to draw while the panel is hidden, e.g. under a
        // fullscreen window; the eye catches up once it is shown again
        if (!this._area.mapped)
            return;

        const now = GLib.get_monotonic_time() / 1000;
        const [x, y, mods] = global.get_pointer();
        if (this._lastX !== x || this._lastY !== y) {
            this._lastX = x;
            this._lastY = y;
            this._lastMove = now;
            this._area.queue_repaint();
        }

        if (this._blinkOnClick) {
            const buttons = mods & BUTTONS_MASK;
            // A button that was not pressed at the previous check
            if (buttons & ~this._buttons)
                this._blink(now);
            this._buttons = buttons;
        }

        if (this._blinkEnabled && now >= this._nextBlink)
            this._blink(now);

        const target = this._sleepy && now - this._lastMove > SLEEP_DELAY ? SLEEP_LEVEL : 1;
        if (target !== this._sleepTarget) {
            this._sleepTarget = target;
            this._startAnimation();
        }
    }

    _blink(now) {
        this._nextBlink = now + this._blinkPause();
        if (this._blinkStart)
            return;
        this._blinkStart = now;
        this._startAnimation();
    }

    // Repaints the eye every frame while it blinks, falls asleep or wakes up
    _startAnimation() {
        if (this._animationId)
            return;
        this._animationId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, EYE_ANIMATION_INTERVAL, () => {
            const now = GLib.get_monotonic_time() / 1000;
            if (this._blinkStart && now - this._blinkStart >= BLINK_DURATION)
                this._blinkStart = 0;

            const step = EYE_ANIMATION_INTERVAL / SLEEP_TRANSITION * (1 - SLEEP_LEVEL);
            if (this._sleepLevel < this._sleepTarget)
                this._sleepLevel = Math.min(this._sleepTarget, this._sleepLevel + step);
            else if (this._sleepLevel > this._sleepTarget)
                this._sleepLevel = Math.max(this._sleepTarget, this._sleepLevel - step);

            this._area.queue_repaint();
            if (this._blinkStart || this._sleepLevel !== this._sleepTarget)
                return GLib.SOURCE_CONTINUE;

            this._animationId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    // How far the eye is open right now, from 0 to 1
    _lidLevel(now) {
        let blink = 1;
        if (this._blinkStart) {
            const progress = (now - this._blinkStart) / BLINK_DURATION;
            // Closes during the first half of a blink and opens again
            if (progress < 1)
                blink = Math.abs(1 - 2 * progress);
        }
        return blink * this._sleepLevel;
    }

    _draw(area) {
        const [areaWidth, areaHeight] = area.get_surface_size();
        // Nothing to draw before the area gets a real size
        if (areaWidth <= 0 || areaHeight <= 0)
            return;
        const [areaX, areaY] = area.get_transformed_position();

        const [pointerX, pointerY] = global.get_pointer();
        const centerX = areaWidth / 2;
        const centerY = areaHeight / 2;
        let mouseX = pointerX - areaX;
        let mouseY = pointerY - areaY;
        // The transformed position is NaN until the panel is laid out
        if (!Number.isFinite(mouseX) || !Number.isFinite(mouseY)) {
            mouseX = centerX;
            mouseY = centerY;
        }

        // Fit the eye with its outline into the box
        const lineWidth = this._lineWidth;
        const boxW = Math.min(this._boxWidth, areaWidth) - lineWidth;
        const boxH = Math.min(this._size, areaHeight) - lineWidth;

        // The eyes to draw: [style, offset of the center, radius]
        let eyes;
        if (this._mode === 'pair') {
            const gap = this._size * PAIR_GAP;
            const eyeRad = Math.min((boxW - gap - lineWidth) / 2, boxH) / 2;
            const offset = eyeRad + (gap + lineWidth) / 2;
            eyes = [['bulb', -offset, eyeRad], ['bulb', offset, eyeRad]];
        } else if (this._mode === 'lids' || this._mode === 'cat') {
            // The lids rise to 0.6 of the eye radius
            eyes = [[this._mode, 0, Math.min(boxW / 2, boxH / 2 / 0.6)]];
        } else {
            eyes = [[this._mode, 0, Math.min(boxW, boxH) / 2]];
        }
        // No room for an eye at all: drawing with a zero radius
        // would leave the Cairo context in an error state
        if (!eyes.every(eye => eye[2] > 0))
            return;

        const lid = this._lidLevel(GLib.get_monotonic_time() / 1000);
        const cr = area.get_context();

        const color = (this._colorEye && this._circle.active && parseColor(this._circle.color)) ||
            area.get_theme_node().get_foreground_color();
        setSourceColor(cr, color);

        for (const [style, offset, eyeRad] of eyes) {
            const dx = mouseX - centerX - offset;
            const dy = mouseY - centerY;
            const near = this._pupilDistance
                ? 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) / (PUPIL_FAR * this._scale))
                : 0;
            cr.save();
            cr.translate(centerX + offset, centerY);
            drawEye(cr, style, {eyeRad, dx, dy, lineWidth, lid, near});
            cr.restore();
        }

        cr.$dispose();
    }
});

export default class EyeExtendedExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._circle = new MouseCircle(this, this._settings,
            () => this._indicator?.circleChanged());
        this._trail = new PointerTrail(this, this._settings);
        this._cat = new DesktopCat(this, this._settings);

        this._addIndicator();
        this._settings.connectObject(
            'changed::eye-position', () => this._addIndicator(),
            'changed::eye-position-weight', () => this._addIndicator(),
            this);
    }

    disable() {
        this._settings?.disconnectObject(this);
        this._indicator?.destroy();
        this._indicator = null;
        this._circle?.destroy();
        this._circle = null;
        this._trail?.destroy();
        this._trail = null;
        this._cat?.destroy();
        this._cat = null;
        this._settings = null;
    }

    _addIndicator() {
        this._indicator?.destroy();
        this._indicator = new EyeIndicator(this, this._settings, this._circle);
        Main.panel.addToStatusArea(this.uuid, this._indicator,
            this._settings.get_int('eye-position-weight'),
            this._settings.get_string('eye-position'));
    }
}
