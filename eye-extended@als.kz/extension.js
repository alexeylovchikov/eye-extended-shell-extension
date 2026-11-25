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
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

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

function setSourceColor(cr, color) {
    cr.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, color.alpha / 255);
}

// Returns an icon with a copy of the shape SVG colored and cached on disk
function createShapeIcon(extension, mode, color) {
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
        const [, bytes] = source.load_contents(null);
        const contents = new TextDecoder().decode(bytes)
            .replace('fill="#000000"', `fill="${color}"`);
        dest.replace_contents(new TextEncoder().encode(contents), null, false,
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

    toggle() {
        this.setActive(!this._active);
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
        this._interval = s.get_int('mouse-circle-repaint-interval');
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

        this._defaultIcon = this._createIcon(this._color);
        for (const click of Object.values(this._clicks))
            click.icon = this._createIcon(click.color);
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

    _createIcon(color) {
        return createShapeIcon(this._extension, this._mode, color);
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
        this._pointer.set_position(x - this._size / 2, y - this._size / 2);
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
        if (this._pointer && this._enabled)
            this._pointer.set_position(x - this._size / 2, y - this._size / 2);

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

        if (this._pointer)
            this._pointer.gicon = click.icon;

        const actor = new St.Icon({
            x: x - this._size / 2,
            y: y - this._size / 2,
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
            x: x - this._size * scale / 2,
            y: y - this._size * scale / 2,
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
            'changed::eye-repaint-interval', () => {
                this._loadSettings();
                this._stopTimer();
                this._startTimer();
            },
            this);

        this.connect('destroy', () => this._stopTimer());
    }

    queueRepaint() {
        this._area.queue_repaint();
    }

    // Left click toggles the mouse indicator, other buttons open the menu
    vfunc_event(event) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS &&
            event.get_button() === Clutter.BUTTON_PRIMARY) {
            this.menu.close();
            this._circle.toggle();
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_event(event);
    }

    _loadSettings() {
        this._mode = this._settings.get_string('eye-mode') === 'lids' ? 'lids' : 'bulb';
        this._size = this._settings.get_int('eye-size');
        this._lineWidth = this._settings.get_double('eye-line-width');
        this._margin = this._settings.get_double('eye-margin');
        this._interval = this._settings.get_int('eye-repaint-interval');

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

        if (mouseRad > maxRad)
            mouseRad = maxRad;

        const irisArc = Math.asin(irisRad / eyeRad);
        const irisR = eyeRad * Math.cos(irisArc);
        const eyeAng = Math.atan(mouseRad / irisR);

        const cr = area.get_context();

        const color = (this._circle.active && parseColor(this._circle.color)) ||
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
            () => this._indicator?.queueRepaint());

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
