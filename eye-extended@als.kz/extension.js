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
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

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
        this._clicks = {
            [Clutter.ModifierType.BUTTON1_MASK]: {
                enabled: s.get_boolean('mouse-circle-left-click-enable'),
                color: s.get_string('mouse-circle-left-click-color'),
            },
            [Clutter.ModifierType.BUTTON2_MASK]: {
                enabled: s.get_boolean('mouse-circle-middle-click-enable'),
                color: s.get_string('mouse-circle-middle-click-color'),
            },
            [Clutter.ModifierType.BUTTON3_MASK]: {
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
const EyeIndicator = GObject.registerClass(
class EyeIndicator extends PanelMenu.Button {
    _init(extension, settings, circle) {
        super._init(0.5, extension.metadata.name, false);

        this._settings = settings;
        this._circle = circle;
        this._timeoutId = 0;
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
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupMenuItem(_('Settings'));
        settingsItem.connect('activate', () => extension.openPreferences());
        this.menu.addMenuItem(settingsItem);

        this._loadSettings();
        this._startTimer();

        this._settings.connectObject(
            'changed::eye-mode', () => this._loadSettings(),
            'changed::eye-size', () => this._loadSettings(),
            'changed::eye-line-width', () => this._loadSettings(),
            'changed::eye-margin', () => this._loadSettings(),
            'changed::mouse-circle-color-eye', () => this._loadSettings(),
            'changed::water-ripple-enable', () => this._trailItem.setToggleState(
                this._settings.get_boolean('water-ripple-enable')),
            'changed::water-ripple-trigger', () => this._syncTrailLabel(),
            'changed::eye-repaint-interval', () => {
                this._loadSettings();
                this._stopTimer();
                this._startTimer();
            },
            this);

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
        this._mode = this._settings.get_string('eye-mode') === 'lids' ? 'lids' : 'bulb';
        this._colorEye = this._settings.get_boolean('mouse-circle-color-eye');
        this._size = this._settings.get_int('eye-size');
        this._lineWidth = this._settings.get_double('eye-line-width');
        this._margin = this._settings.get_double('eye-margin');
        this._interval = Math.max(1, this._settings.get_int('eye-repaint-interval'));

        // The eye is drawn inside a fixed box; the margin only adds space on
        // the sides, so it never changes the panel button height.
        this._boxWidth = this._mode === 'lids' ? this._size * 1.5 : this._size;
        this._area.set_width(Math.round(this._boxWidth + 2 * this._margin));
        this._area.queue_repaint();
    }

    _startTimer() {
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._interval, () => {
            const [x, y] = global.get_pointer();
            if (this._lastX !== x || this._lastY !== y) {
                this._lastX = x;
                this._lastY = y;
                this._area.queue_repaint();
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    _draw(area) {
        const [areaWidth, areaHeight] = area.get_surface_size();
        // Nothing to draw before the area gets a real size
        if (areaWidth <= 0 || areaHeight <= 0)
            return;
        const [areaX, areaY] = area.get_transformed_position();

        const [pointerX, pointerY] = global.get_pointer();
        let mouseX = pointerX - areaX - areaWidth / 2;
        let mouseY = pointerY - areaY - areaHeight / 2;
        // The transformed position is NaN until the panel is laid out
        if (!Number.isFinite(mouseX) || !Number.isFinite(mouseY))
            mouseX = mouseY = 0;

        const mouseAng = Math.atan2(mouseY, mouseX);
        let mouseRad = Math.sqrt(mouseX * mouseX + mouseY * mouseY);

        // Fit the eye with its outline into the box
        const boxW = Math.min(this._boxWidth, areaWidth) - this._lineWidth;
        const boxH = Math.min(this._size, areaHeight) - this._lineWidth;

        let eyeRad, irisRad, pupilRad, maxRad;
        if (this._mode === 'lids') {
            // The lids rise to 0.6 of the eye radius
            eyeRad = Math.min(boxW / 2, boxH / 2 / 0.6);
            irisRad = eyeRad * 0.5;
            pupilRad = irisRad * 0.4;
            maxRad = eyeRad * (Math.pow(Math.cos(mouseAng), 4) * 0.5 + 0.25);
        } else {
            eyeRad = Math.min(boxW, boxH) / 2;
            irisRad = eyeRad * 0.6;
            pupilRad = irisRad * 0.4;
            maxRad = eyeRad * Math.cos(Math.asin(irisRad / eyeRad)) - this._lineWidth;
        }
        // A thick outline on a small eye leaves no room to move
        maxRad = Math.max(0, maxRad);

        if (mouseRad > maxRad)
            mouseRad = maxRad;

        const irisArc = Math.asin(irisRad / eyeRad);
        const irisR = eyeRad * Math.cos(irisArc);
        const eyeAng = Math.atan(mouseRad / irisR);

        const cr = area.get_context();

        const color = (this._colorEye && this._circle.active && parseColor(this._circle.color)) ||
            area.get_theme_node().get_foreground_color();
        setSourceColor(cr, color);

        cr.translate(areaWidth * 0.5, areaHeight * 0.5);
        cr.setLineWidth(this._lineWidth);

        if (this._mode === 'lids') {
            const xDef = irisRad * Math.cos(mouseAng) * Math.sin(eyeAng);
            const yDef = irisRad * Math.sin(mouseAng) * Math.sin(eyeAng);
            const topAmp = eyeRad * 0.8;
            const bottomAmp = eyeRad * 0.6;

            const lidsPath = () => {
                cr.moveTo(-eyeRad, 0);
                cr.curveTo(xDef - irisRad, yDef + topAmp,
                    xDef + irisRad, yDef + topAmp, eyeRad, 0);
                cr.curveTo(xDef + irisRad, yDef - bottomAmp,
                    xDef - irisRad, yDef - bottomAmp, -eyeRad, 0);
            };

            lidsPath();
            cr.stroke();
            lidsPath();
            cr.clip();
        } else {
            cr.arc(0, 0, eyeRad, 0, 2 * Math.PI);
            cr.stroke();
        }

        cr.rotate(mouseAng);
        cr.setLineWidth(this._lineWidth / irisRad);

        cr.translate(irisR * Math.sin(eyeAng), 0);
        cr.scale(irisRad * Math.cos(eyeAng), irisRad);
        cr.arc(0, 0, 1.0, 0, 2 * Math.PI);
        cr.stroke();
        cr.scale(1 / (irisRad * Math.cos(eyeAng)), 1 / irisRad);
        cr.translate(-irisR * Math.sin(eyeAng), 0);

        cr.translate(eyeRad * Math.sin(eyeAng), 0);
        cr.scale(pupilRad * Math.cos(eyeAng), pupilRad);
        cr.arc(0, 0, 1.0, 0, 2 * Math.PI);
        cr.fill();

        cr.$dispose();
    }
});

export default class EyeExtendedExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._circle = new MouseCircle(this, this._settings,
            () => this._indicator?.circleChanged());
        this._trail = new PointerTrail(this, this._settings);

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
