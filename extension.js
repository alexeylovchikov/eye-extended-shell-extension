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
		this.position_weight = settings.get_int('position-weight');
		this.line_width = settings.get_double('line-width');
		this.margin = settings.get_double('margin');
		this.update_interval = 100;
		
		this.area = new St.DrawingArea();
	 
		this.setMargin();

		this.actor.add_actor(this.area);
	},

	setTrayArea() {
		Main.panel.addToStatusArea('EyeExtended'+ Math.random(), this, this.position_weight, this.eye_position);
	},

	setMargin: function() 
	{
		this.area.set_width((Panel.PANEL_ICON_SIZE * 2) - (2 * this.margin));
		this.area.set_height(Panel.PANEL_ICON_SIZE - (2 * this.margin));
		this.actor.set_width(Panel.PANEL_ICON_SIZE * (2 * this.margin));
	},

	setActive: function(enabled)
	{
		if (enabled) {
			this._repaint_handler = this.area.connect("repaint", Lang.bind(this, this._draw));
			this._update_handler = Mainloop.timeout_add(this.update_interval, Lang.bind(this, this._on_timeout));

			this.area.queue_repaint();
		} else {
		    if(this._repaint_handler)
				this.area.disconnect(this._repaint_handler);
		    if(this._update_handler)
				Mainloop.source_remove(this._update_handler);
		}
	}, 

	_on_timeout: function()
	{
		this.area.queue_repaint();
		return true;
	},

	_draw: function(area) 
	{
		let [area_width, area_height] = area.get_surface_size();
		let [area_x, area_y] = this._get_pos();
		area_x += area_width/2;
		area_y += area_height/2;
		let [mouse_x, mouse_y, mask] = global.get_pointer();
		mouse_x -= area_x;
		mouse_y -= area_y;
		
		let mouse_ang = Math.atan2(mouse_y, mouse_x);
		let mouse_rad = Math.sqrt(mouse_x*mouse_x + mouse_y*mouse_y);
		
		let eye_rad;
		let iris_rad;
		let pupil_rad;
		let max_rad;

		if(this.eye_mode == "bulb")
		{
			eye_rad = (area_height)/2.3;
			iris_rad = eye_rad*0.6;
			pupil_rad = iris_rad*0.4;
			
			max_rad = eye_rad*Math.cos( Math.asin((iris_rad)/eye_rad) )-this.line_width;
		}

		if(this.eye_mode == "lids")
		{
			eye_rad = (area_height)/2;
			iris_rad = eye_rad*0.5;
			pupil_rad = iris_rad*0.4;
			
			max_rad = eye_rad* ( Math.pow(Math.cos(mouse_ang),4)*0.5 + 0.25)
		}
		
		if(mouse_rad > max_rad)
			mouse_rad = max_rad;
		
		let iris_arc = Math.asin(iris_rad/eye_rad);
		let iris_r = eye_rad*Math.cos(iris_arc);
		
		let eye_ang = Math.atan(mouse_rad/iris_r);
		
		let cr = area.get_context();
		let theme_node = this.area.get_theme_node();
		Clutter.cairo_set_source_color(cr, theme_node.get_foreground_color());
				
		cr.translate(area_width*0.5, area_height*0.5);
				
		cr.setLineWidth(this.line_width);
		
		if(this.eye_mode == "bulb")
		{
			cr.arc(0,0, eye_rad, 0,2*Math.PI);
			cr.stroke();
		}

		if(this.eye_mode == "lids")
		{
			let x_def = iris_rad*Math.cos(mouse_ang)*(Math.sin(eye_ang));
			let y_def = iris_rad*Math.sin(mouse_ang)*(Math.sin(eye_ang));
			let amp;
			
			let top_lid = 0.8;
			let bottom_lid = 0.6
			
			amp = eye_rad*top_lid;
			cr.moveTo(-eye_rad,0);
			cr.curveTo(x_def-iris_rad, y_def+amp,
						x_def+iris_rad, y_def+amp, eye_rad,0);

			amp = eye_rad*bottom_lid;
			cr.curveTo(x_def+iris_rad, y_def-amp,
						x_def-iris_rad, y_def-amp, -eye_rad,0);
			cr.stroke();
		
			amp = eye_rad*top_lid;
			cr.moveTo(-eye_rad,0);
			cr.curveTo(x_def-iris_rad, y_def+amp,
						x_def+iris_rad, y_def+amp, eye_rad,0);

			amp = eye_rad*bottom_lid;
			cr.curveTo(x_def+iris_rad, y_def-amp,
						x_def-iris_rad, y_def-amp, -eye_rad,0);
			cr.clip();
		}
		
		
		cr.rotate(mouse_ang);		
		cr.setLineWidth(this.line_width/iris_rad);
		
		cr.translate( iris_r*Math.sin(eye_ang), 0);
		cr.scale(iris_rad*Math.cos(eye_ang), iris_rad);
		cr.arc(0,0, 1.0, 0,2*Math.PI);
		cr.stroke();
		cr.scale(1/(iris_rad*Math.cos(eye_ang)), 1/iris_rad);
		cr.translate(-iris_r*Math.sin(eye_ang), 0);

		cr.translate( eye_rad*Math.sin(eye_ang), 0);
		cr.scale(pupil_rad*Math.cos(eye_ang), pupil_rad);
		cr.arc(0,0, 1.0, 0,2*Math.PI);
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

function setEyeMode(icon) {
	let value = settings.get_string('eye-mode');

	if (eye) {
		eye.eye_mode = value;
	}
}

function setEyePosition(icon) {
	let value = settings.get_string('eye-position');

	if (eye) {
		eye.eye_position = value;
		eye.setTrayArea();
	}	
}

function setPositionWeight(icon) {
	let value = settings.get_int('position-weight');

	if (eye) {
		eye.position_weight = value;
		eye.setTrayArea();
	}	
}

function setLineWidth(icon) {
	let value = settings.get_double('line-width');

	if (eye) {
		eye.line_width = value;
	}		
}

function setMargin(icon) {
	let value = settings.get_double('margin');

	if (eye) {
		eye.margin = value;
		eye.setMargin();
	}		
}

function init() {
	Convenience.initTranslations(); 
}

function enable()
{
    settings = Convenience.getSettings();
    settings.connect('changed::eye-mode', Lang.bind(this, setEyeMode));
    settings.connect('changed::eye-position', Lang.bind(this, setEyePosition));
    settings.connect('changed::position-weight', Lang.bind(this, setPositionWeight));
    settings.connect('changed::line-width', Lang.bind(this, setLineWidth));
    settings.connect('changed::margin', Lang.bind(this, setMargin));

	eye = new Eye(settings);
	eye.setActive(true);
	eye.setTrayArea();
}

function disable()
{
	eye.setActive(false);
	eye.destroy();
}