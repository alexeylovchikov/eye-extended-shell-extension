# Changelog

<!-- last-commit: 792a5c9c6fb511ad128910365092d42ea6f1c7f1 -->

## Unreleased

### New
- Support for **GNOME Shell 45–51**. GNOME Shell 40–44 stay on the earlier version of the extension.
- **Desktop cat**: a ginger cat runs after the cursor, sits down next to it, grooms itself and falls asleep. Click it and it swipes a paw, tumbles, rolls over or jumps; hold the left button on it to pick it up by the scruff, carry it and throw it; shake the cursor next to it and it runs away and sulks. It is off by default: turn it on with **Cat** in the menu of the eye. The **Cat** tab sets its **Size** and **Distance to the cursor**.
- **Pointer trail**: an animation follows the mouse, either **While Ctrl is held** or **Always** (setting **Show**). Four animations: **Water ripples**, **Pointer line** (a smooth line that fades away, like a laser pointer), **Comet tail** and **Sparkles**, with adjustable shape, size, line thickness, duration and color. Turn it on and off with **Pointer trail** in the menu of the eye.
- Five new eye shapes: **Cat eye**, **Pair of eyes**, **Cartoon**, **Lens** and **Crosshair**.
- The eye can **Blink**, **Blink on click**, widen its pupil as the cursor comes closer (**Pupil reacts to the cursor**) and **Fall asleep** when the mouse has not moved for 30 seconds.
- A **Size** setting for the eye.
- The mouse indicator is turned on and off with **Mouse indicator** in the menu of the eye; a click on the eye now only opens the menu. Whether the eye takes the color of the indicator is a setting, **Color the eye**, off by default.
- The settings are split into the tabs **Eye**, **Mouse indicator**, **Pointer trail** and **Cat**, every setting has a short explanation, and the three click colors are in one row, **Click colors**.
- A **Reset to defaults** button returns every setting to its default value.
- New defaults: different colors for left, middle and right clicks, and new sizes for the eye, the mouse indicator and the pointer trail.
- The settings are fully translated into German, French, Dutch and Russian.
- A **Support the project on Ko-fi** link in the settings.

### Fixed
- Clicks are now highlighted in application windows too, including on Wayland.
- On Wayland, middle and right clicks were highlighted with each other's colors.
- Click flashes and the pointer trail did not show in remote desktop (RDP) sessions and with animations turned off in the system settings.
- The eye and the mouse indicator did not follow the display scale factor on HiDPI screens.
- A long pointer line, with a long **Duration (ms)** and fast mouse movement, could freeze on the screen.
- The mouse indicator stopped after the refresh interval of the eye was changed.
- The **Settings** item in the menu of the eye was not translated.
