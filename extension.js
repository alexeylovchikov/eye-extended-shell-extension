const St = imports.gi.St;
const Main = imports.ui.main;
const Lang = imports.lang;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const Panel = imports.ui.panel;
const Cairo = imports.cairo;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Gio = imports.gi.Gio;

let settings = null;
let eye;

const Eye = new Lang.Class({
    Name: 'Eye',
	Extends: PanelMenu.Button,
	
	_init: function(settings)
	{
		PanelMenu.Button.prototype._init.call(this, "");

		this.eye_mode = settings.get_string('eye-mode');
		this.eye_position = settings.get_string('eye-position');
		this.eye_position_weight = settings.get_int('eye-position-weight');
		this.eye_line_width = settings.get_double('eye-line-width');
		this.eye_margin = settings.get_double('eye-margin');
		this.eye_update_interval = 100;

		this.mouse_circle_mode = settings.get_int('mouse-circle-mode');
		this.mouse_circle_size = settings.get_int('mouse-circle-size');
		this.mouse_circle_opacity = settings.get_int('mouse-circle-opacity');
		this.mouse_circle_update_interval = 1;
		this.mouse_circle_show = false;
		this.mouse_pointer = null;
		
		this.area = new St.DrawingArea();	 
		this.actor.add_actor(this.area);
		this.actor.connect('button-press-event', this.showMouseCircle.bind(this));
	},

	setActive: function(enabled)
	{
		this.setEyePropertyUpdate();

		if (enabled) {
			this._repaint_handler = this.area.connect("repaint", Lang.bind(this, this._draw));
			
			this._eye_update_handler = Mainloop.timeout_add(
				this.eye_update_interval, Lang.bind(this, this._on_eye_timeout)
			);

			this._mouse_circle_update_handler = Mainloop.timeout_add(
				this.mouse_circle_update_interval, Lang.bind(this, this._on_mouse_circle_timeout)
			);

			this.area.queue_repaint();

			this.mouse_pointer = new St.Icon({
				reactive : false,
				can_focus : false,
				track_hover : false
			});
		} else {
		    if(this._repaint_handler) { this.area.disconnect(this._repaint_handler); }

			if(this._eye_update_handler) { 
				Mainloop.source_remove(this._eye_update_handler); 
			}
			
			if(this._mouse_circle_update_handler) { 
				Mainloop.source_remove(this._mouse_circle_update_handler);
			}

			this.mouse_pointer.destroy();
			this.mouse_pointer = null;
		}
	}, 

	setEyePropertyUpdate: function() 
	{
		Main.panel.addToStatusArea(
			'EyeExtended'+ Math.random(), this, this.eye_position_weight, this.eye_position
		);

		this.area.set_width((Panel.PANEL_ICON_SIZE * 2) - (2 * this.eye_margin));
		this.area.set_height(Panel.PANEL_ICON_SIZE - (2 * this.eye_margin));
		this.actor.set_width(Panel.PANEL_ICON_SIZE * (2 * this.eye_margin));
	},

	setMouseCirclePropertyUpdate: function() 
	{
		if (this.mouse_pointer) {
			if (this.mouse_pointer) {
				this.mouse_pointer.gicon = Gio.icon_new_for_string(
					`${Me.path}//img/circle/${this.mouse_circle_mode}.svg`);
			}
			this.mouse_pointer.icon_size = this.mouse_circle_size; 
			this.mouse_pointer.opacity = this.mouse_circle_opacity;
		} 
	},

	setMouseCircleActive: function(enabled)
	{
		if (enabled) {
			this.setMouseCirclePropertyUpdate();
			this.mouse_pointer.show();
			Main.uiGroup.add_child(this.mouse_pointer);			
		} else {
			this.mouse_pointer.hide();
			Main.uiGroup.remove_child(this.mouse_pointer);
		}
	},

	showMouseCircle: function() {
		this.mouse_circle_show = !this.mouse_circle_show;
		this.setMouseCircleActive(this.mouse_circle_show);
	},

	_on_mouse_circle_timeout: function()
	{
		if (this.mouse_pointer) {
			let [mouse_x, mouse_y, mask] = global.get_pointer();
			this.mouse_pointer.set_position(
				mouse_x - (this.mouse_circle_size / 2), 
				mouse_y - (this.mouse_circle_size / 2)
			);
		}
		return true;
	},	

	_on_eye_timeout: function()
	{
		this.area.queue_repaint();
		return true;
	},

	_draw: function(area) 
	{
		let [area_width, area_height] = area.get_surface_size();
		let [area_x, area_y] = this._get_pos();
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

		if(this.eye_mode == "bulb")
		{
			eye_rad = (area_height) / 2.3;
			iris_rad = eye_rad * 0.6;
			pupil_rad = iris_rad * 0.4;
			
			max_rad = eye_rad * Math.cos(Math.asin((iris_rad) / eye_rad) ) - this.eye_line_width;
		}

		if(this.eye_mode == "lids")
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
			Clutter.cairo_set_source_color(cr, Clutter.Color.new(255, 215, 0, 255));
		} else {
			Clutter.cairo_set_source_color(cr, theme_node.get_foreground_color());
		}
				
		cr.translate(area_width * 0.5, area_height * 0.5);				
		cr.setLineWidth(this.eye_line_width);
		
		if(this.eye_mode == "bulb")
		{
			cr.arc(0,0, eye_rad, 0,2 * Math.PI);
			cr.stroke();
		}

		if(this.eye_mode == "lids")
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
	},

	_get_pos: function()
	{
		let area_x = 0;
		let area_y = 0;
		
		let obj = this.area;
		do
		{
			try {
				[tx, ty] = obj.get_position();
			} catch {
				tx = 0;
				ty = 0;
			}
			area_x += tx;
			area_y += ty;
			obj = obj.get_parent();
		}
		while(obj);
		
		return [area_x, area_y];
	},
});

function setEyePropertyUpdate(icon) {
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
		eye.setMouseCirclePropertyUpdate();
	}
}

function init() {
	Convenience.initTranslations(); 
}

function enable()
{
	settings = Convenience.getSettings();
    settings.connect('changed::eye-mode', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::eye-position', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::eye-position-weight', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::eye-line-width', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::eye-margin', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-mode', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-size', Lang.bind(this, setEyePropertyUpdate));
    settings.connect('changed::mouse-circle-opacity', Lang.bind(this, setEyePropertyUpdate));

	eye = new Eye(settings);
	eye.setActive(true);
}

function disable()
{
	eye.setActive(false);
	eye.destroy();
	eye = null;
}