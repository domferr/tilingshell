# Documentation for JSON exported layouts

*Tiling Shell* supports importing and exporting its layouts as a JSON file. With this you can create your own custom layouts, or fine-tune already existing layouts.

The exported layouts (from the preferences) are a collection of `Layout` objects. A `Layout` object is an object with two (2) properties: 

- identifier as a `string` 
- a list of `Tile` objects

Example JSON of a `Layout` object would look like

```json
{
	"id": "The identifier",
	"tiles": [
		...
	]
}
```

A `Tile` object has five (5) properties:

- The X (`x`) axis as a `float`
- The Y (`y`) axis as a `float`
- The width (`width`) as a `float`
- The height (`height`) as a `float`
- A list of identifiers `groups`

The `x`, `y`, `width` and `height` are percentages relative to the screen size. Both `x` and `y` start from the top left of a `Tile`.

So a `Tile` with `x` = 0.5 and `y` = 0.5, on a screen with a resolution of 1920x1080 pixels is placed at `x = 0.5 * 1920 = 960px` and `y = 0.5 * 1080 = 540px`. For example, if the `width` and `height` of the `Tile` are set to `0.25`, this gives a `Tile` of `width = 0.25 * 1920 = 480px` and `height = 0.25 * 1080 = 270px`.

The `group` attribute is mainly used in the layout editor where it determines which `Tile`(s) are "linked": if you resize a single `Tile` it's linked neighbour(s) are also updated.

For more in depth information you can look at an [in depth explanation](https://github.com/domferr/tilingshell/issues/177#issuecomment-2458322208) of `group`(s).

Example JSON of a `Tile` object would look like this

```json
{
	"x": 0,
	"y": 0,
	"width": 1,
	"height": 1,
	"groups": [
		1
	]
}
```

## Example JSON file

Finally, an example JSON file describing one Layout with two tiles.

```json
{
	"id": "Equal split",
	"tiles": [
		{ 
			"x": 0,
			"y": 0,
			"width": 0.5,
			"height": 1,
			"groups": [
				1
			]
		},
		{
			"x": 0.5,
			"y": 0,
			"width": 0.5,
			"height": 1,
			"groups": [
				1
			]
		}
	]
}
```
