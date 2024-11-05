# Internal documentation for JSON exported layouts.

*Tiling Shell* supports importing and exporting it's layouts as a JSON file. With this you can create your own custom layouts, or fine-tune already existing layouts.

The exported layouts (from the preferences) are a collection of `Layout` objects. A `Layout` object is an object with two (2) properties: 

- identifier as a `string`  
- a list of `Tile` objects.

A `Tile` object has five (5) properties:

- The X (`x`) axis as a `float`
- The Y (`y`) axis as a `float`
- The width (`width`) as a `float`
- The height (`height`) as a `float`
- A list of identifiers `groups`

The `x`, `y`, `width` and `height` are percentages relative to the screen size. Both `x` and `y` start from the top left of a `Tile`.

So a `Tile` with `x` = 0.5 and `y` = 0.5, on a screen with a resolution of 1920x1080 pixels is placed at `x = 0.5 * 1920 = 960px` and `y = 0.5 * 1080 = 540px`.

The `width` and `height` of the `Tile` are set to `0.25`, which gives a `Tile` of `width = 0.25 * 1920 = 480px` and `height = 0.25 * 1080 = 270px`.

*Info about the `group` attribute will come here.*

## Example JSON file

```js
{
	"id": "Equal split",
	"tiles": [
		{ 
			"x": 0,
			"y": 0,
			"width": 0.5,
			"height": 1,
			"groups": [
				2
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
