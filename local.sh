echo "==================================="
echo "Linting and minifying files..."
echo "==================================="
echo "Validating source files..."
echo "-----------------------------------"
echo "Validating JavaScript"
npx eslint index.js
echo "-----------------------------------"
echo "Validating HTML"
npx htmlhint index.html
npx htmlhint release_notes.html
echo "-----------------------------------"
echo "Validating CSS"
npx stylelint index.css
echo "-----------------------------------"
echo "All source files validated successfully."
echo "==================================="
echo "Starting minification process..."
echo "Output will be in the 'out' directory."
mkdir -p out
echo "-----------------------------------"
echo "Minifying HTML"
npx html-minifier --collapse-whitespace --remove-comments --minify-css true --minify-js true -o ./out/index.html index.html
npx html-minifier --collapse-whitespace --remove-comments --minify-css true --minify-js true -o ./out/release_notes.html release_notes.html 
echo "-----------------------------------"
echo "Minifying JavaScript"
npx terser index.js -o ./out/index.js --compress --mangle --comments "/eslint/"
echo "-----------------------------------"
echo "Minifying CSS"
npx csso-cli index.css --output ./out/index.css 
echo "-----------------------------------"
echo "Minification complete."
echo "==================================="
echo "Starting validation of minified files..."
echo "-----------------------------------"
echo "Validating minified JavaScript"
npx eslint --no-ignore out/index.js
echo "-----------------------------------"
echo "Validating minified HTML"
npx htmlhint out/index.html
npx htmlhint out/release_notes.html
echo "-----------------------------------"
echo "Validating minified CSS"
npx stylelint out/index.css
echo "-----------------------------------"
echo "Building release notes JSON..."
python release_notes.py --num_commits 15 --output out/release_notes.json 
echo "-----------------------------------"
echo "All done!"
echo "==================================="