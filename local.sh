#!/usr/bin/env bash
set -euo pipefail

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
npx html-minifier-terser --collapse-whitespace --remove-comments --minify-css true --minify-js true -o ./out/index.html index.html
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
echo "-----------------------------------"
echo "Validating minified CSS"
npx stylelint out/index.css
echo "-----------------------------------"
echo "Validation complete."

echo "==================================="
echo "Preparing local deployment bundle (out/)..."

# Clean previously copied deployment assets in out/
rm -rf out/vendor out/media

# Keep the same dependency layout expected by index.html
mkdir -p out/vendor/bootstrap
mkdir -p out/vendor/datatables
mkdir -p out/vendor/jquery
mkdir -p out/vendor/moment

cp node_modules/bootstrap/dist/css/bootstrap.min.css out/vendor/bootstrap/
cp node_modules/bootstrap/dist/js/bootstrap.bundle.min.js out/vendor/bootstrap/
cp node_modules/datatables.net/js/dataTables.js out/vendor/datatables/
cp node_modules/datatables.net-bs5/css/dataTables.bootstrap5.css out/vendor/datatables/
cp node_modules/datatables.net-bs5/js/dataTables.bootstrap5.js out/vendor/datatables/
cp node_modules/jquery/dist/jquery.min.js out/vendor/jquery/
cp node_modules/moment/min/moment.min.js out/vendor/moment/

# Deploy app files (minified front core + static assets)
for optional_file in release_notes.html release_notes.json release_notes.js release_notes.css; do
	if [[ -f "$optional_file" ]]; then
		cp "$optional_file" out/
	fi
done

cp nanardi.png out/
cp goodenough.jpg out/
cp fav.png out/
cp -r media out/

echo "-----------------------------------"
echo "Local deployment bundle ready in out/"
echo "Tip: node server.js out/ to serve the minified version locally."
echo "==================================="