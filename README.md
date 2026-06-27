# CodeDetective

Interactive control-flow graphs for Python code, rendered in a hand-drawn RoughJS sketchy style directly in VS Code.

## Screenshots

![Module view](media/screenshot-module.png)
*Module-level CFG — all functions and classes as drillable nodes*

![Place order method](media/screenshot-place_order.png)
*Function CFG with branching, calls, and edge labels*

![Add item method](media/screenshot-add_item.png)
*Class method CFG with type-aware call resolution*

## Features

- **One-click CFG** — right-click any Python function → "CodeDetective: Show code flow"
- **Hand-drawn aesthetic** — RoughJS sketchy style
- **Interactive** — pan, zoom, hover for tooltips, collapse/expand regions
- **Call resolution** — click a function call to see the callee's CFG
- **Type-aware** — resolves `self.attr.method()`, constructor calls, return type annotations
- **Edge labels** — "Yes"/"No" on branches, exception types on try/except edges
- **Cursor-driven** — place cursor on any call and trigger CFG to drill in
- **Module view** — trigger CFG at module level to see all functions/classes as drillable nodes

## Usage

1. Open a Python file
2. Right-click inside any function → **CodeDetective: Show code flow**
3. Or run from command palette (`Cmd+Shift+P`): **CodeDetective: Show code flow**

### Graph Controls

| Action | Control |
|--------|---------|
| Pan | Click and drag empty space |
| Zoom | Scroll wheel or +/- buttons |
| Fit | Click ⊡ button |
| Collapse/Expand | Double-click loop/if/for/while headers |
| Tooltip | Hover over any node |
| Reveal source | Click a node with source range |

## Requirements

- VS Code 1.90+
- Python files only

## What's Next

- **Entity-Relationship Diagrams (ERD)** — visualize domain models, dataclasses, and relationships between entities
- Light theme support
- Layout direction toggle
- More export formats (PNG, PDF)
- TypeScript/JavaScript support

## License

MIT
