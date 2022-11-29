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
'use strict';

const Main = imports.ui.main;// access to the panel menu;
const Lang = imports.lang;// helper library to point to and connect objects;
const PanelMenu = imports.ui.panelMenu;// object classes for items in the panel
const Panel = imports.ui.panel;// libraries for the panel area
const Mainloop = imports.mainloop;// library for drawing and animating the eye
const { Atspi, Clutter, GLib , GObject, Gio, St } = imports.gi;// graphic objects libraries;
const ExtensionUtils = imports.misc.extensionUtils;// access to settings from schema
const Me = ExtensionUtils.getCurrentExtension();

let settings = null;// create a global variable to connect user settings
let eye = null;// create the variable to hold our extension object


// Class to create the Eye
const Eye = GObject.registerClass({},
    class Eye extends PanelMenu.Button {

        // Create/return a cache directory for thumbnails
        _initDataDir() {
            let data_dir = `${GLib.get_user_cache_dir()}/${Me.metadata['gettext-domain']}`;
            if (GLib.mkdir_with_parents(`${data_dir}/icons`, 0o777) < 0)
                throw new Error(`Failed to create cache dir at ${data_dir}`);
            return data_dir;
        }

        _init(settings) {
            // Load superclass method
            PanelMenu.Button.prototype._init.call(this, "");

            // Load parameters for Eye
            this.eye_mode = settings.get_string('eye-mode');
            this.eye_position = settings.get_string('eye-position');
            this.eye_position_weight = settings.get_int('eye-position-weight');
            this.eye_line_width = settings.get_double('eye-line-width');
            this.eye_margin = settings.get_double('eye-margin');
            this.eye_repaint_interval = settings.get_int('eye-repaint-interval');

            // Load parameters for Mouse circle
            this.mouse_circle_mode = settings.get_int('mouse-circle-mode');
            this.mouse_circle_size = settings.get_int('mouse-circle-size');
            this.mouse_circle_opacity = settings.get_int('mouse-circle-opacity');
            this.mouse_circle_repaint_interval = settings.get_int('mouse-circle-repaint-interval');
            this.mouse_circle_enable = settings.get_boolean('mouse-circle-enable');
            this.mouse_circle_left_click_enable = settings.get_boolean('mouse-circle-left-click-enable');
            this.mouse_circle_right_click_enable = settings.get_boolean('mouse-circle-right-click-enable');
            this.mouse_circle_middle_click_enable = settings.get_boolean('mouse-circle-middle-click-enable');

            // Load parameters for Mouse circle color
            this.mouse_circle_color = settings.get_string('mouse-circle-color');
            this.mouse_circle_left_click_color = settings.get_string('mouse-circle-left-click-color');
            this.mouse_circle_right_click_color = settings.get_string('mouse-circle-right-click-color');
            this.mouse_circle_middle_click_color = settings.get_string('mouse-circle-middle-click-color');

            this.mouse_circle_show = false;
            this.mouse_pointer = null;
            this.data_dir = this._initDataDir();

            this.area = new St.DrawingArea();
            this.add_actor(this.area);
            this.connect('button-press-event', this._eyeClick.bind(this));

            Atspi.init();
            this._mouseListener = Atspi.EventListener.new(Lang.bind(this, this._mouseCircleClick));

            this.setActive(true);
            this.setMouseCirclePropertyUpdate();
        }

        destroy() {
            this.setMouseCircleActive(false);
            this.setActive(false);
            this.area.destroy();
            super.destroy();
        }

        setActive(enabled) {
            this.setEyePropertyUpdate();

            if(this._repaint_handler) {
                this.area.disconnect(this._repaint_handler);
                this._repaint_handler = null;
            }

            if(this._eye_update_handler) {
                Mainloop.source_remove(this._eye_update_handler);
                this._eye_update_handler = null;
            }

            if(this._mouse_circle_update_handler) {
                Mainloop.source_remove(this._mouse_circle_update_handler);
                this._mouse_circle_update_handler = null;
            }

            if (enabled) {
                this._repaint_handler = this.area.connect("repaint", Lang.bind(this, this._eyeDraw));

                this._eye_update_handler = Mainloop.timeout_add(
                    this.eye_repaint_interval, Lang.bind(this, this._eyeTimeout)
                );

                this.area.queue_repaint();
            }
        }

        // MOUSE CIRCLE FUNCTIONS

        _mouseCircleCreateDataIcon(name, color) {
            // Load content
            let source = Gio.File.new_for_path(`${Me.path}/circle/${this.mouse_circle_mode}.svg`);
            let [l_success, contents] = source.load_contents(null);
            contents = imports.byteArray.toString(contents);

            // Replace to new color
            contents = contents.replace('fill="#000000"', `fill="${color}"`);

            // Save content to cache dir
            let dest = Gio.File.new_for_path(`${this.data_dir}/icons/${this.mouse_circle_mode}_${name}_${color}.svg`);
            if (!dest.query_exists(null)) {
                dest.create(Gio.FileCreateFlags.NONE, null);
            }
            let [r_success, tag] = dest.replace_contents(contents, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        }

        _mouseCircleTimeout() {
            if (this.mouse_pointer) {
                let [mouse_x, mouse_y, mask] = global.get_pointer();
                this.mouse_pointer.set_position(
                    mouse_x - (this.mouse_circle_size / 2),
                    mouse_y - (this.mouse_circle_size / 2)
                );
            }
            return true;
        }

        _mouseCircleClick(event) {

            let clickAnimation = function(self, click_type, color) {
                let [mouse_x, mouse_y, mask] = global.get_pointer();
                let actor_scale = self.mouse_circle_size > 20 ? 1.5 : 3;

                if (self.mouse_pointer) {
                    self.mouse_pointer.gicon = Gio.icon_new_for_string(`${self.data_dir}/icons/${self.mouse_circle_mode}_${click_type}_${color}.svg`);
                }

                let actor = new St.Icon({
                    x: mouse_x - (self.mouse_circle_size / 2),
                    y: mouse_y - (self.mouse_circle_size / 2),
                    reactive : false,
                    can_focus : false,
                    track_hover : false,
                    icon_size : self.mouse_circle_size,
                    opacity : self.mouse_circle_opacity,
                    gicon : Gio.icon_new_for_string(`${self.data_dir}/icons/${self.mouse_circle_mode}_${click_type}_${color}.svg`)
                });

                Main.uiGroup.add_child(actor);

                actor.ease({
                    x: mouse_x - (self.mouse_circle_size * actor_scale / 2),
                    y: mouse_y - (self.mouse_circle_size * actor_scale / 2),
                    scale_x: actor_scale,
                    scale_y: actor_scale,
                    opacity: 0,
                    duration: 500,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: function () {
                        Main.uiGroup.remove_child(actor);
                        actor.destroy;
                        actor = null;

                        if (self.mouse_pointer) {
                            self.mouse_pointer.gicon = Gio.icon_new_for_string(`${self.data_dir}/icons/${self.mouse_circle_mode}_default_${self.mouse_circle_color}.svg`);
                        }
                    }
                });
            };

            switch (event.type) {
                case 'mouse:button:1p':
                    if (this.mouse_circle_left_click_enable)
                        clickAnimation(this,'left_click', this.mouse_circle_left_click_color);
                    break;
                case 'mouse:button:2p':
                    if (this.mouse_circle_middle_click_enable)
                        clickAnimation(this,'middle_click', this.mouse_circle_middle_click_color);
                    break;
                case 'mouse:button:3p':
                    if (this.mouse_circle_right_click_enable)
                        clickAnimation(this,'right_click', this.mouse_circle_right_click_color);
                    break;
            }
        }

        setMouseCirclePropertyUpdate() {
            this._mouseCircleCreateDataIcon('default', this.mouse_circle_color);
            this._mouseCircleCreateDataIcon('left_click', this.mouse_circle_left_click_color);
            this._mouseCircleCreateDataIcon('right_click', this.mouse_circle_right_click_color);
            this._mouseCircleCreateDataIcon('middle_click', this.mouse_circle_middle_click_color);

            if (this.mouse_pointer) {
                this.mouse_pointer.icon_size = this.mouse_circle_size;
                this.mouse_pointer.opacity = this.mouse_circle_enable ? this.mouse_circle_opacity : 0;
                this.mouse_pointer.gicon = Gio.icon_new_for_string(`${this.data_dir}/icons/${this.mouse_circle_mode}_default_${this.mouse_circle_color}.svg`);
            }
        }

        setMouseCircleActive(enabled) {
            if (enabled == null) {
                enabled = this.mouse_circle_show;
            }

            if (this.mouse_pointer) {
                Main.uiGroup.remove_child(this.mouse_pointer);
                this.mouse_pointer.destroy();
                this.mouse_pointer = null;
            }

            if (enabled) {
                this._mouse_circle_update_handler = Mainloop.timeout_add(
                    this.mouse_circle_repaint_interval, Lang.bind(this, this._mouseCircleTimeout)
                );

                this.mouse_pointer = new St.Icon({
                    reactive : false,
                    can_focus : false,
                    track_hover : false,
                    icon_size: this.mouse_circle_size,
                    opacity: this.mouse_circle_opacity,
                    gicon: Gio.icon_new_for_string(`${this.data_dir}/icons/${this.mouse_circle_mode}_default_${this.mouse_circle_color}.svg`)
                });
                Main.uiGroup.add_child(this.mouse_pointer);

                this.setMouseCirclePropertyUpdate();
                this._mouseCircleTimeout();

                this._mouseListener.register('mouse');
            } else {
                if(this._mouse_circle_update_handler) {
                    Mainloop.source_remove(this._mouse_circle_update_handler);
                    this._mouse_circle_update_handler = null;
                }

                this._mouseListener.deregister('mouse');
            }
        }

        // EYE FUNCTIONS

        _eyeTimeout() {
            this.area.queue_repaint();
            return true;
        }

        _eyeClick(actor, event) {
            let button = event.get_button();

            if (button === 1 /* Left button */) {
                this.mouse_circle_show = !this.mouse_circle_show;
                this.setMouseCircleActive(this.mouse_circle_show);
            }

            if (button === 2 /* Right button */) {
            }
        }

        _eyeDraw(area) {
            let get_pos = function(self)
            {
                let area_x = 0;
                let area_y = 0;

                let obj = self.area;
                do
                {
                    let tx = 0;
                    let ty = 0;
                    try {
                        [tx, ty] = obj.get_position();
                    } catch {
                    }
                    area_x += tx;
                    area_y += ty;
                    obj = obj.get_parent();
                }
                while(obj);

                return [area_x, area_y];
            };

            let [area_width, area_height] = area.get_surface_size();
            let [area_x, area_y] = get_pos(this);
            area_x += area_width / 2;
            area_y += area_height / 2;

            let [mouse_x, mouse_y, mask] = global.get_pointer();
            mouse_x -= area_x;
            mouse_y -= area_y;

            let mouse_ang = Math.atan2(mouse_y, mouse_x);
            let mouse_rad = Math.sqrt(mouse_x * mouse_x + mouse_y * mouse_y);

            let eye_rad;
            let iris_rad;
            let pupil_rad;
            let max_rad;

            if(this.eye_mode === "bulb")
            {
                eye_rad = (area_height) / 2.3;
                iris_rad = eye_rad * 0.6;
                pupil_rad = iris_rad * 0.4;

                max_rad = eye_rad * Math.cos(Math.asin((iris_rad) / eye_rad) ) - this.eye_line_width;
            }

            if(this.eye_mode === "lids")
            {
                eye_rad = (area_height) / 2;
                iris_rad = eye_rad * 0.5;
                pupil_rad = iris_rad * 0.4;

                max_rad = eye_rad * (Math.pow(Math.cos(mouse_ang), 4) * 0.5 + 0.25)
            }

            if(mouse_rad > max_rad)
                mouse_rad = max_rad;

            let iris_arc = Math.asin(iris_rad / eye_rad);
            let iris_r = eye_rad * Math.cos(iris_arc);

            let eye_ang = Math.atan(mouse_rad / iris_r);

            let cr = area.get_context();
            let theme_node = this.area.get_theme_node();

            if (this.mouse_circle_show) {
                let [ok, color] = Clutter.Color.from_string(this.mouse_circle_color);
                Clutter.cairo_set_source_color(cr, ok ? color : theme_node.get_foreground_color());
            } else {
                Clutter.cairo_set_source_color(cr, theme_node.get_foreground_color());
            }

            cr.translate(area_width * 0.5, area_height * 0.5);
            cr.setLineWidth(this.eye_line_width);

            if(this.eye_mode === "bulb")
            {
                cr.arc(0,0, eye_rad, 0,2 * Math.PI);
                cr.stroke();
            }

            if(this.eye_mode === "lids")
            {
                let x_def = iris_rad * Math.cos(mouse_ang) * (Math.sin(eye_ang));
                let y_def = iris_rad * Math.sin(mouse_ang) * (Math.sin(eye_ang));
                let amp;

                let top_lid = 0.8;
                let bottom_lid = 0.6

                amp = eye_rad * top_lid;
                cr.moveTo(-eye_rad, 0);
                cr.curveTo(x_def-iris_rad, y_def + amp,
                            x_def + iris_rad, y_def + amp, eye_rad, 0);

                amp = eye_rad * bottom_lid;
                cr.curveTo(x_def + iris_rad, y_def - amp,
                            x_def - iris_rad, y_def - amp, -eye_rad, 0);
                cr.stroke();

                amp = eye_rad * top_lid;
                cr.moveTo(-eye_rad, 0);
                cr.curveTo(x_def - iris_rad, y_def + amp,
                            x_def + iris_rad, y_def + amp, eye_rad, 0);

                amp = eye_rad * bottom_lid;
                cr.curveTo(x_def + iris_rad, y_def - amp,
                            x_def - iris_rad, y_def - amp, -eye_rad, 0);
                cr.clip();
            }

            cr.rotate(mouse_ang);
            cr.setLineWidth(this.eye_line_width / iris_rad);

            cr.translate(iris_r * Math.sin(eye_ang), 0);
            cr.scale(iris_rad * Math.cos(eye_ang), iris_rad);
            cr.arc(0,0, 1.0, 0,2 * Math.PI);
            cr.stroke();
            cr.scale(1 / (iris_rad * Math.cos(eye_ang)), 1 / iris_rad);
            cr.translate(-iris_r * Math.sin(eye_ang), 0);

            cr.translate(eye_rad * Math.sin(eye_ang), 0);
            cr.scale(pupil_rad * Math.cos(eye_ang), pupil_rad);
            cr.arc(0,0, 1.0, 0,2 * Math.PI);
            cr.fill();

            cr.save();
            cr.restore();
            cr.$dispose();
        }

        setEyePropertyUpdate() {
            Main.panel.addToStatusArea('EyeExtended'+ Math.random(), this, this.eye_position_weight, this.eye_position);
            this.area.set_width((Panel.PANEL_ICON_SIZE * 2) - (2 * this.eye_margin));
            this.area.set_height(Panel.PANEL_ICON_SIZE - (2 * this.eye_margin));
            this.set_width(Panel.PANEL_ICON_SIZE * (2 * this.eye_margin));
        }
});

function setEyePropertyUpdate() {
    if (eye) {
        eye.eye_mode = settings.get_string('eye-mode');
        eye.eye_position = settings.get_string('eye-position');
        eye.eye_position_weight = settings.get_int('eye-position-weight');
        eye.eye_line_width = settings.get_double('eye-line-width');
        eye.eye_margin = settings.get_double('eye-margin');
        eye.setEyePropertyUpdate();

        eye.mouse_circle_mode = settings.get_int('mouse-circle-mode');
        eye.mouse_circle_size = settings.get_int('mouse-circle-size');
        eye.mouse_circle_opacity = settings.get_int('mouse-circle-opacity');
        eye.mouse_circle_enable = settings.get_boolean('mouse-circle-enable');
        eye.mouse_circle_left_click_enable = settings.get_boolean('mouse-circle-left-click-enable');
        eye.mouse_circle_right_click_enable = settings.get_boolean('mouse-circle-right-click-enable');
        eye.mouse_circle_middle_click_enable = settings.get_boolean('mouse-circle-middle-click-enable');

        eye.mouse_circle_color = settings.get_string('mouse-circle-color');
        eye.mouse_circle_left_click_color = settings.get_string('mouse-circle-left-click-color');
        eye.mouse_circle_right_click_color = settings.get_string('mouse-circle-right-click-color');
        eye.mouse_circle_middle_click_color = settings.get_string('mouse-circle-middle-click-color');
        eye.setMouseCirclePropertyUpdate();
    }
}

function setEyeRepaintInterval() {
    if (eye) {
        eye.eye_repaint_interval = settings.get_int('eye-repaint-interval');
        eye.setActive(true);
    }
}

function setMouseCircleRepaintInterval() {
    if (eye) {
        eye.mouse_circle_repaint_interval = settings.get_int('mouse-circle-repaint-interval');
        eye.setMouseCircleActive(null);
    }
}

function init() {}// launch the extension

// Run when the extension is enabled
function enable() {
    settings = ExtensionUtils.getSettings();

    // Connect the changing of any value to an update function

    settings.connect('changed::eye-mode', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::eye-position', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::eye-position-weight', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::eye-line-width', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::eye-margin', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::eye-repaint-interval', Lang.bind(this, setEyeRepaintInterval));

    settings.connect('changed::mouse-circle-mode', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-size', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-opacity', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-repaint-interval', Lang.bind(this, setMouseCircleRepaintInterval));
    settings.connect('changed::mouse-circle-enable', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-left-click-enable', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-right-click-enable', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-middle-click-enable', Lang.bind(this, setEyePropertyUpdate));

    settings.connect('changed::mouse-circle-color', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-left-click-color', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-right-click-color', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-middle-click-color', Lang.bind(this, setEyePropertyUpdate));

    eye = new Eye(settings);
}

// Run when extension is disabled
function disable() {
    eye.destroy();
    eye = null;
}
