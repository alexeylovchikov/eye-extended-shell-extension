const St = imports.gi.St;
const Main = imports.ui.main;
const Lang = imports.lang;
const Util = imports.misc.util;
const PanelMenu = imports.ui.panelMenu;
const Mainloop = imports.mainloop;
const Panel = imports.ui.panel;
const Clutter = imports.gi.Clutter;
const Cairo = imports.cairo;
 

const UPDATE_INTERVAL = 100;

const LINE_WIDTH = 1.5;
 
const MARGIN = 1;
 
const EyePosition = {
    CENTER: 0,
    RIGHT: 1,
    LEFT: 2
}

const EyeMode ={
	BULB: 0,
	LIDS: 1
}

const Eye = new Lang.Class({
    Name: 'Eye',
	Extends: PanelMenu.Button,
	
	_init: function(eye_mode, position_in_panel, index_in_panel)
	{
		PanelMenu.Button.prototype._init.call(this, "");

	    this.area = new St.DrawingArea();
	 
		this.area.set_width(Panel.PANEL_ICON_SIZE*2 - 2 * MARGIN);
		this.area.set_height(Panel.PANEL_ICON_SIZE - 2 * MARGIN);
	     
	    this.actor.set_width(Panel.PANEL_ICON_SIZE*2.5);
	    this.actor.add_actor(this.area);
		
		this.position_in_panel = position_in_panel;
		this.eye_mode = eye_mode;

		let children = null;
		let box = null;
		switch (this.position_in_panel)
		{
			case EyePosition.LEFT:
				box = Main.panel._leftBox;
				break;
			case EyePosition.CENTER:
				box = Main.panel._centerBox;
				break;
			case EyePosition.RIGHT:
				box = Main.panel._rightBox;
				break;
		}
	},

	setActive: function(enabled)
	{
		if (enabled) {
			this._repaint_handler = this.area.connect("repaint", Lang.bind(this, this._draw));
			this._update_handler = Mainloop.timeout_add(UPDATE_INTERVAL, Lang.bind(this, this._on_timeout));

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
		if(this.eye_mode == EyeMode.BULB)
		{
			eye_rad = (area_height)/2.3;
			iris_rad = eye_rad*0.6;
			pupil_rad = iris_rad*0.4;
			
			max_rad = eye_rad*Math.cos( Math.asin((iris_rad)/eye_rad) )-LINE_WIDTH;
		}
		if(this.eye_mode == EyeMode.LIDS)
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
		
		
		cr.setLineWidth(LINE_WIDTH);
		
		if(this.eye_mode == EyeMode.BULB)
		{
			cr.arc(0,0, eye_rad, 0,2*Math.PI);
			cr.stroke();
		}
		if(this.eye_mode == EyeMode.LIDS)
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
		cr.setLineWidth(LINE_WIDTH/iris_rad);
		
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
			[tx, ty] = obj.get_position();
			area_x += tx;
			area_y += ty;
			obj = obj.get_parent();
		}
		while(obj);
		
		return [area_x, area_y];
	},
});

var eye;

function init() {
}

function enable()
{
	eye = new Eye(EyeMode.LIDS, EyePosition.RIGHT, 0);
	eye.setActive(true);

    Main.panel.addToStatusArea('eye', eye);
}

function disable()
{
	eye.setActive(false);
	eye.destroy();
}