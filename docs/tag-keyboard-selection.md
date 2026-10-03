# Tag keyboard selection

Diamond and coloring book tag searches share the same keyboard behavior. Type
in the search field, use the arrow keys to highlight an existing tag, and press
Enter to select it. A partial search such as `flow` can select `flowers`.

Creating a tag requires selecting the explicit Create item. Enter in the search
field activates the highlighted command item; it does not create directly from
the input text. Exact existing matches remain selectable by keyboard.

Existing tags must remain searchable when their request completes after typing
starts. Both pickers give each command item its tag name as an explicit value,
so filtering does not depend on text content from an item that has not rendered.
Component and browser regressions hold tag responses until after search input.
