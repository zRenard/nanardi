// Initialize DataTable
let table;

// Suppress console errors for failed resource loads globally
window.addEventListener('error', function(event) {
    // Suppress errors for images that fail to load
    if (event.filename && event.filename.includes('media/')) {
        return true;
    }
}, true);

$(document).ready(function() {
    console.log('DOM ready, initializing DataTable...');
    // Custom ordering: use the numeric value from the cell's `data-order` attribute
    // This plugin returns an array of numeric values used by DataTables when ordering the column.
    $.fn.dataTable.ext.order['dom-data-order'] = function (settings, col) {
        return this.api().column(col, { order: 'index' }).nodes().map(function (td) {
            const v = $(td).attr('data-order');
            return v !== undefined && v !== null ? parseFloat(v) || 0 : 0;
        });
    };

    // Custom ordering for dates: read `data-sort-value` (US format YYYY-MM-DD) for sorting
    // but display dates in French format via render function
    $.fn.dataTable.ext.order['dom-date-us'] = function (settings, col) {
        return this.api().column(col, { order: 'index' }).nodes().map(function (td) {
            const v = $(td).attr('data-sort-value');
            if (!v) return 0;
            // Convert YYYY-MM-DD to a sortable numeric value: YYYYMMDD
            const parts = v.split('-');
            if (parts.length === 3) {
                return parseInt(parts[0] + parts[1] + parts[2], 10);
            }
            return 0;
        });
    };
    
    table = new DataTable('#liste', {
        paging: false,
        scrollCollapse: true,
        scrollY: '50vh',
        order: [[3, 'desc']],
        language: {
            info: '_TOTAL_ films',
            infoEmpty: 'Aucun films disponible',
            infoFiltered: '(filtré de _MAX_ films au total)',
            lengthMenu: 'Afficher _MENU_ films par page',
            zeroRecords: 'Aucun films trouvé - désolé',
            search: 'Recherche:'
        },
        lengthMenu: [
            [20, 40, 60, -1],
            [20, 40, 60, 'All']
        ],
        columnDefs: [
            { targets: 7, visible: false },
            {
                targets: 3,
                // Use custom date ordering that reads `data-sort-value` (US format)
                orderDataType: 'dom-date-us'
            },
            {
                targets: 0,
                // Use our custom order plugin that reads `data-order`
                orderDataType: 'dom-data-order',
                type: 'num',
                render: function (data, type, row, meta) {
                    // For ordering, return the numeric rating value.
                    if (type === 'sort' || type === 'order') {
                        try {
                            // Try data-order attribute first
                            const settings = meta.settings;
                            const $table = $(settings.nTable);
                            const $cell = $table.find('tbody tr').eq(meta.row).find('td').eq(meta.col);
                            const orderAttr = $cell.attr('data-order');
                            if (orderAttr !== undefined) {
                                const n = parseFloat(orderAttr);
                                return isNaN(n) ? 0 : n;
                            }

                            // Fallback: extract from hidden .rating-sort span in the HTML
                            if (typeof data === 'string') {
                                const m = data.match(/<span[^>]*class=["']rating-sort["'][^>]*>(\d+)\/<\/span>|<span[^>]*class=["']rating-sort["'][^>]*>(\d+)<\/span>/i);
                                if (m) {
                                    const val = m[1] || m[2];
                                    const n2 = parseFloat(val);
                                    return isNaN(n2) ? 0 : n2;
                                }
                            }

                            return 0;
                        } catch (err) {
                            return 0;
                        }
                    }

                    // For display and other types, return original data
                    return data;
                }
            }
        ],
    });
    
    movieRating = new MovieRating();
    
    document.getElementById('updateDate').textContent = new Date(document.lastModified).toLocaleString('fr-FR');
    
    // Populate date cells AFTER DataTables initialization
    // This converts US dates (YYYY-MM-DD) to French format (DD/MM/YYYY) and stores sort value
    $('tbody tr').each(function() {
        const $row = $(this);
        const dateCell = $row.find('td[date]');
        
        if (dateCell.length) {
            let dateValue = dateCell.text().trim();
            
            // Check if it looks like a full date (YYYY-MM-DD format)
            if (dateValue && dateValue.match(/^\d{4}-\d{2}-\d{2}/)) {
                // Store the US format in data-sort-value for sorting
                dateCell.attr('data-sort-value', dateValue.substring(0, 10)); // Extract just YYYY-MM-DD
                // Convert YYYY-MM-DD to DD/MM/YYYY and display
                const dateMatch = dateValue.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (dateMatch) {
                    const [, year, month, day] = dateMatch;
                    dateCell.text(day + '/' + month + '/' + year);
                }
            }
        }
    });
    
    // Force DataTables to re-read the updated DOM
    try {
        table.rows().invalidate().draw(false);
    } catch (err) {
        // ignore if not ready
    }
});

// Toggle column visibility
$('a.toggle-vis').on('click', function (event) {
    event.preventDefault();
    let column = table.column($(this).attr('data-column'));
    column.visible(!column.visible());
    $(this).toggleClass('icon-visible icon-hidden');
});

// Extract IMDb IDs and process links from the new structure
$('tbody tr').each(function() {
    const $row = $(this);
    const linksCell = $row.find('td[links]');
    
    if (linksCell.length) {
        // Extract URLs from data attributes
        const replayUrl = linksCell.attr('data-replay') || '';
        const imdbUrl = linksCell.attr('data-imdb') || '';
        const justwatchUrl = linksCell.attr('data-justwatch') || '';
        
        // Extract IMDb ID for posters
        if (imdbUrl) {
            const imdbIdMatch = imdbUrl.match(/\/title\/(tt\d+)/);
            if (imdbIdMatch) {
                const imdbId = imdbIdMatch[1];
                const posterCell = $row.find('td[poster]');
                if (posterCell.length) {
                    posterCell.attr('data-imdb-id', imdbId);
                }
            }
        }
        
        // Create merged links cell content
        const linksContainer = $('<div>').addClass('links-container');
        
        // Add YouTube icon if replay URL exists
        if (replayUrl) {
            const youtubeIcon = $('<a>')
                .attr('href', replayUrl)
                .attr('target', '_blank')
                .addClass('youtube-replay-icon')
                .attr('title', 'Regarder sur YouTube')
                .html('<div class="youtube-icon">' +
                      '<svg width="34" height="25" viewBox="0 0 28 20" fill="currentColor">' +
                      '<path d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 2.24288e-07 14.285 0 14.285 0C14.285 0 5.35042 2.24288e-07 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C2.24288e-07 5.35042 0 10 0 10C0 10 2.24288e-07 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5701 5.35042 27.9727 3.12324Z" fill="#FF0000"/>' +
                      '<path d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z" fill="white"/>' +
                      '</svg></div>');
            linksContainer.append(youtubeIcon);
        }
        
        // Add IMDb icon if IMDb URL exists
        if (imdbUrl) {
            const imdbIcon = $('<a>')
                .attr('href', imdbUrl)
                .attr('target', '_blank')
                .addClass('imdb-replay-icon')
                .attr('title', 'Voir sur IMDb')
                .html('<div class="imdb-icon">' +
                      '<svg width="50" height="25" viewBox="0 0 64 32" fill="currentColor">' +
                      '<rect width="64" height="32" rx="4" fill="#F5C518"/>' +
                      '<text x="32" y="22" font-family="Arial Black, sans-serif" font-size="14" font-weight="900" text-anchor="middle" fill="#000000">IMDb</text>' +
                      '</svg></div>');
            linksContainer.append(imdbIcon);
        }
        
        // Add JustWatch icon if JustWatch URL exists
        if (justwatchUrl) {
            const justwatchIcon = $('<a>')
                .attr('href', justwatchUrl)
                .attr('target', '_blank')
                .addClass('justwatch-replay-icon')
                .attr('title', 'Voir sur JustWatch')
                .html('<div class="justwatch-icon">' +
                      '<svg width="83" height="25" viewBox="0 0 80 24" fill="currentColor">' +
                      '<rect width="80" height="24" rx="12" fill="#FFD23F"/>' +
                      '<text x="40" y="16" font-family="Arial, sans-serif" font-size="10" font-weight="bold" text-anchor="middle" fill="#1A1A1A">JustWatch</text>' +
                      '</svg></div>');
            linksContainer.append(justwatchIcon);
        }
        
        linksCell.html(linksContainer);
    }
});

// Function to get directory listing via fetch
async function getDirectoryListing(directoryPath) {
    try {
        const response = await fetch(directoryPath);
        const text = await response.text();
        
        // Parse the HTML directory listing to extract image files
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const links = doc.querySelectorAll('a[href]');
        
        const imageFiles = [];
        for(const link of links) {
            const href = link.getAttribute('href');
            // Check if it's an image file and not poster.jpg
            if (href && href.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                // Extract just the filename (in case href contains a path)
                const filename = href.split(/[/\\]/).pop();
                
                // Exclude poster.* and goodenough.* files from the additional images listing
                if (filename.match(/^poster\.(jpg|jpeg|png)$/i) || filename.match(/^goodenough\.(jpg|jpeg|png)$/i)) {
                    continue;
                }
                imageFiles.push(filename);
            }
        };
        
        return imageFiles.sort(); // Sort alphabetically
    } catch (error) {
        console.log(`Could not list directory ${directoryPath}:`, error);
        return [];
    }
}

// Initialize posters and images after IMDb IDs are set
initializePostersAndImages();

// Function to initialize posters and images after IMDb IDs are set
function initializePostersAndImages() {
    // Handle poster thumbnails
    $('td[poster]').each(function () {
        const imdbId = $(this).data('imdb-id');
        
        if (imdbId) {
            const $this = $(this);

            // Utility to try multiple image sources in order
            function trySources(sources, finalHandler) {
                // Try sources sequentially using an off-DOM Image tester.
                // Calls finalHandler(src) with the first working src, or null if none work.
                if (!Array.isArray(sources) || sources.length === 0) {
                    if (finalHandler) finalHandler(null);
                    return;
                }

                let idx = 0;

                const tryNext = () => {
                    if (idx >= sources.length) {
                        if (finalHandler) finalHandler(null);
                        return;
                    }

                    const candidate = sources[idx++];
                    const tester = new Image();
                    let settled = false;

                    // Safety timeout in case load/error never fire
                    const to = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        tester.onload = tester.onerror = null;
                        tryNext();
                    }, 5000);

                    tester.onload = () => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(to);
                        tester.onload = tester.onerror = null;
                        if (finalHandler) finalHandler(candidate);
                    };

                    tester.onerror = () => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(to);
                        tester.onload = tester.onerror = null;
                        tryNext();
                    };

                    // Start the request
                    tester.src = candidate;
                };

                tryNext();
            }

            // Candidate poster sources (try jpg then png, then goodenough variants)
            const posterCandidates = [
                `media/${imdbId}/poster.jpg`,
                `media/${imdbId}/poster.png`,
                // Prefer per-movie goodenough, then global fallback at project root
                `media/${imdbId}/goodenough.jpg`,
                `media/${imdbId}/goodenough.png`,
                `./goodenough.jpg`,
                `./goodenough.png`
            ];

        // Create thumbnail image
        const thumbnail = $('<img>')
            .attr('alt', 'Poster')
            .addClass('poster-thumbnail-large');

        // Try poster candidates and hide if none work
        trySources(posterCandidates, (workingSrc) => {
            if (workingSrc) {
                thumbnail.attr('src', workingSrc);
            } else {
                thumbnail.hide();
            }
        });

        // Click handler shows modal with same source resolution strategy for modal
        thumbnail.on('click', function() {
            const modalImg = $('#modalPosterImg');
            const currentSrc = $(this).attr('src') || posterCandidates[0];

            // If the thumbnail ended up using a good alternative, show that; otherwise try candidates for modal
            if (currentSrc) {
                modalImg.attr('src', currentSrc);
            }

            // If modal image fails, try the remaining candidates and finally show a placeholder
            const modalCandidates = [
                `media/${imdbId}/poster.jpg`,
                `media/${imdbId}/poster.png`,
                `media/${imdbId}/goodenough.jpg`,
                `media/${imdbId}/goodenough.png`,
                `./goodenough.jpg`,
                `./goodenough.png`
            ];

            trySources(modalCandidates, (workingSrc) => {
                if (!workingSrc) {
                    modalImg.attr('src', 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIiBzdHJva2U9IiNkZWUyZTYiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNmM3NTdkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2UgaW5kaXNwb25pYmxlPC90ZXh0Pjwvc3ZnPg==');
                } else {
                    modalImg.attr('src', workingSrc);
                }
            });

            const movieTitle = $(this).closest('tr').find('td[title]').text();
            $('#posterModalLabel').text('Poster - ' + movieTitle);
            $('#posterModal').modal('show');
        });

        $this.html(thumbnail);
    }
});


// Handle additional movie images
$('td[images]').each(async function () {
    const $row = $(this).closest('tr');
    const imdbId = $row.find('td[poster]').data('imdb-id');
    
    if (imdbId) {
        const $this = $(this);
        const imagesContainer = $('<div>').addClass('images-container');
        
        // Dynamically get all image files from the directory (excluding poster.jpg)
        const directoryPath = `media/${imdbId}/`;
        const imageFiles = await getDirectoryListing(directoryPath);
        
        let imageCount = 0;
        const maxImages = 8; // Increased limit since we're being dynamic
        
        // Process each image file found
        for (const imageName of imageFiles) {
            if (imageCount >= maxImages) break;
            
            const imagePath = `${directoryPath}${imageName}`;
            
            // Use a Promise to handle image loading
            const loadImage = new Promise((resolve, reject) => {
                const testImg = new Image();
                testImg.onload = () => resolve(imagePath);
                testImg.onerror = () => reject();
                testImg.src = imagePath;
            });
            
            try {
                await loadImage;
                
                const thumbnail = $('<img>')
                    .attr('src', imagePath)
                    .attr('alt', `${imageName}`)
                    .attr('title', imageName)
                    .addClass('additional-image-thumbnail')
            .on('click', function() {
                // Show modal with full size image
                const modalImg = $('#modalPosterImg');
                modalImg.attr('src', imagePath);
                
                // Handle image load error in modal
                modalImg.off('error').on('error', function() {
                                $(this).attr('src', 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjhmOWZhIiBzdHJva2U9IiNkZWUyZTYiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNmM3NTdkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2UgaW5kaXNwb25pYmxlPC90ZXh0Pjwvc3ZnPg==');
                            });
                            
                            const movieTitle = $row.find('td[title]').text();
                $('#posterModalLabel').text(`${movieTitle} - ${imageName}`);
                $('#posterModal').modal('show');
            });
            
            imagesContainer.append(thumbnail);
                imageCount++;
            } catch (error) {
                // Image failed to load, skip it
                console.log(`Failed to load image: ${imagePath}`);
            }
        }
        
        $this.html(imagesContainer);
    }
});
}

// Rating System
class MovieRating {
    storageKey = 'movieRatings';

    constructor() {
        this.init();
    }

    init() {
        this.loadRatings();
        this.setupRatingCells();
        this.setupClearButton();
        this.setupExportImportButtons();
        this.updateMovieStats();
    }

    loadRatings() {
        try {
            const ratings = localStorage.getItem(this.storageKey);
            return ratings ? JSON.parse(ratings) : {};
        } catch (err) {
            console.error('Error loading ratings:', err);
            return {};
        }
    }

    saveRating(movieTitle, rating, imdbId = null) {
        try {
            const ratings = this.loadRatings();
            
            // If we have an IMDb ID, use it as the key, otherwise fall back to title
            const key = imdbId || movieTitle;
            ratings[key] = {
                rating: rating,
                title: movieTitle,
                imdbId: imdbId,
                lastUpdated: new Date().toISOString()
            };
            
            localStorage.setItem(this.storageKey, JSON.stringify(ratings));
        } catch (err) {
            console.error('Error saving rating:', err);
        }
    }

    getRating(movieTitle, imdbId = null) {
        const ratings = this.loadRatings();
        const key = imdbId || movieTitle;
        const ratingData = ratings[key];
        
        // Handle both old format (direct number) and new format (object)
        if (typeof ratingData === 'number') {
            return ratingData;
        } else if (ratingData && typeof ratingData === 'object') {
            return ratingData.rating || 0;
        }
        
        return 0;
    }

    clearAllRatings() {
        try {
            localStorage.removeItem(this.storageKey);
            this.setupRatingCells(); // Refresh all rating displays
            this.updateMovieStats(); // Update statistics
            // Ensure DataTables re-reads updated DOM
            try {
                if (typeof table !== 'undefined' && table) {
                    table.rows().invalidate().draw(false);
                }
            } catch (e) {
                // ignore
            }
        } catch (err) {
            console.error('Error clearing ratings:', err);
        }
    }

    getTotalMovieCount() {
        return $('tbody tr').length;
    }

    getRatedMovieCount() {
        const ratings = this.loadRatings();
        return Object.values(ratings).filter(rating => {
            // Handle both old format (direct number) and new format (object)
            const ratingValue = typeof rating === 'number' ? rating : (rating.rating || 0);
            return ratingValue > 0;
        }).length;
    }

    getAverageRating() {
        const ratings = this.loadRatings();
        const validRatings = Object.values(ratings).map(rating => {
            // Handle both old format (direct number) and new format (object)
            return typeof rating === 'number' ? rating : (rating.rating || 0);
        }).filter(rating => rating > 0);
        
        if (validRatings.length === 0) return '0.0';
        
        const sum = validRatings.reduce((acc, rating) => acc + rating, 0);
        return (sum / validRatings.length).toFixed(1);
    }

    updateMovieStats() {
        const totalMovies = this.getTotalMovieCount();
        const ratedMovies = this.getRatedMovieCount();
        const averageRating = this.getAverageRating();
        
        let statsText = `${totalMovies} films au total`;
        
        if (ratedMovies > 0) {
            const percentage = ((ratedMovies / totalMovies) * 100).toFixed(1);
            statsText += ` • ${ratedMovies} films notés (${percentage}%)`;
            statsText += ` • Note moyenne: ${averageRating}/10 ⭐`;
        } else {
            statsText += ` • Aucun film noté`;
        }
        
        $('#movieStats').text(statsText);
    }

    createStarRating(movieTitle, currentRating = 0, imdbId = null) {
        const container = $('<div>').addClass('star-rating');
        
        // Create 10 stars (for 1-10 rating)
        for (let i = 1; i <= 10; i++) {
            const star = $('<span>')
                .addClass('star')
                .attr('data-rating', i)
                .html('★')
                .on('click', () => {
                    this.setRating(movieTitle, i, imdbId);
                })
                .on('mouseenter', () => {
                    this.highlightStars(container, i);
                })
                .on('mouseleave', () => {
                    this.highlightStars(container, currentRating);
                });
            
            if (i <= currentRating) {
                star.addClass('filled');
            }
            
            container.append(star);
        }

        // Add rating display
        if (currentRating > 0) {
            const display = $('<span>')
                .addClass('rating-display')
                .text(`${currentRating}/10`);
            container.append(display);
        }

        // Hidden numeric value used for sorting by DataTables (prepend so text starts with number)
        const sortValue = $('<span>').addClass('rating-sort').text(currentRating || 0);
        container.prepend(sortValue);

        return container;
    }

    highlightStars(container, rating) {
        container.find('.star').each(function(index) {
            const star = $(this);
            star.removeClass('filled hover');
            
            if (index < rating) {
                star.addClass('hover');
            }
        });
    }

    setRating(movieTitle, rating, imdbId = null) {
        this.saveRating(movieTitle, rating, imdbId);
        
        // Update the display for this movie
        // Find the row by IMDb ID or title
        let row;
        
        if (imdbId) {
            // Find the row with the matching IMDb ID
            row = $(`td[poster][data-imdb-id="${imdbId}"]`).closest('tr');
        } else {
            // Fall back to title matching if no IMDb ID
            row = $(`tbody tr`).filter(function() {
                return $(this).find('td[title], td[titre]').text() === movieTitle;
            });
        }
        
        // Get the first cell (rating cell) of the row
        const ratingCell = row.find('td').first();
        
        if (ratingCell.length) {
            const newRatingDisplay = this.createStarRating(movieTitle, rating, imdbId);
            ratingCell.html(newRatingDisplay);
            // Update numeric sort value used by DataTables
            ratingCell.attr('data-order', rating || 0);
            // Redraw table so sorting can take new value into account
            try {
                if (typeof table !== 'undefined' && table) {
                    // Invalidate the DataTables cached data for this row so it re-reads the DOM
                    try {
                        table.row(row).invalidate().draw(false);
                    } catch (err) {
                        // Fallback: if row invalidation fails, do a full draw
                        table.draw(false);
                    }
                }
            } catch (e) {
                // ignore if DataTable not initialized yet
            }
        }
        
        // Update movie statistics
        this.updateMovieStats();
    }

    extractImdbId(imdbUrl) {
        // Extract IMDb ID from URL like "https://www.imdb.com/fr/title/tt0109098"
        if (!imdbUrl) return null;
        const match = imdbUrl.match(/\/title\/(tt\d+)/);
        return match ? match[1] : null;
    }

    setupRatingCells() {
        // Find ALL td cells in rating column (might be td[note])
        $('tbody tr').each((index, row) => {
            const $row = $(row);
            const $firstCell = $row.find('td').first(); // Get the first td which should be the rating cell
            const movieTitle = $row.find('td[title], td[titre]').text();
            const imdbUrl = $row.find('td[links]').attr('data-imdb');
            const imdbId = this.extractImdbId(imdbUrl);
            
            if (movieTitle && $firstCell.length) {
                const currentRating = this.getRating(movieTitle, imdbId);
                const ratingDisplay = this.createStarRating(movieTitle, currentRating, imdbId);
                $firstCell.html(ratingDisplay);
                // Store numeric rating for DataTables sorting (orthogonal data)
                $firstCell.attr('data-order', currentRating || 0);
            }
        });
        // If DataTables has already been initialized, invalidate cached rows so it re-reads the DOM/html
        try {
            if (typeof table !== 'undefined' && table) {
                table.rows().invalidate().draw(false);
            }
        } catch (e) {
            // ignore if DataTable not ready
        }
    }

    setupClearButton() {
        $('#clearRatings').on('click', () => {
            if (confirm('Êtes-vous sûr de vouloir effacer toutes les notes ?')) {
                this.clearAllRatings();
            }
        });
    }

    setupExportImportButtons() {
        // Export button
        $('#exportRatings').on('click', () => {
            this.exportRatings();
        });

        // Import button triggers file input
        $('#importRatings').on('click', () => {
            $('#importFile').click();
        });

        // File input change handler
        $('#importFile').on('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                this.importRatings(file);
            }
            // Reset file input
            event.target.value = '';
        });
    }

    generateSecureHash(data) {
        // Simple hash function for data integrity verification
        let hash = 0;
        const str = JSON.stringify(data);
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
    }

    validateRatingsData(data) {
        // Validate the structure and content of ratings data
        if (!data || typeof data !== 'object') {
            return false;
        }

        // Check if it has the expected structure
        if (!data.ratings || !data.metadata || !data.checksum) {
            return false;
        }

        // Verify checksum
        const expectedChecksum = this.generateSecureHash(data.ratings);
        if (data.checksum !== expectedChecksum) {
            console.error('Data integrity check failed');
            return false;
        }

        // Validate ratings data structure
        const ratings = data.ratings;
        if (typeof ratings !== 'object') {
            return false;
        }

        // Validate each rating entry
        for (const [key, ratingData] of Object.entries(ratings)) {
            if (typeof key !== 'string' || key.trim() === '') {
                return false;
            }
            
            // Handle both old format (direct number) and new format (object)
            if (typeof ratingData === 'number') {
                // Old format validation
                if (ratingData < 0 || ratingData > 10 || !Number.isInteger(ratingData)) {
                    return false;
                }
            } else if (typeof ratingData === 'object' && ratingData !== null) {
                // New format validation
                if (!Object.prototype.hasOwnProperty.call(ratingData, 'rating') || !Object.prototype.hasOwnProperty.call(ratingData, 'title')) {
                    return false;
                }
                if (typeof ratingData.rating !== 'number' || ratingData.rating < 0 || ratingData.rating > 10 || !Number.isInteger(ratingData.rating)) {
                    return false;
                }
                if (typeof ratingData.title !== 'string' || ratingData.title.trim() === '') {
                    return false;
                }
                // imdbId is optional, but if present should be a string
                if (ratingData.imdbId !== null && ratingData.imdbId !== undefined && typeof ratingData.imdbId !== 'string') {
                    return false;
                }
            } else {
                return false;
            }
        }

        return true;
    }

    exportRatings() {
        try {
            const ratings = this.loadRatings();
            const ratedCount = this.getRatedMovieCount();
            
            const exportData = {
                ratings: ratings,
                metadata: {
                    exportDate: new Date().toISOString(),
                    version: '1.0'
                },
                checksum: this.generateSecureHash(ratings)
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // Create download link
            const link = document.createElement('a');
            link.href = url;
            link.download = `nanardi-ratings-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            
            // Clean up URL object
            URL.revokeObjectURL(url);

            alert(`Export réussi ! ${ratedCount} notes exportées.`);

        } catch (error) {
            console.error('Export failed:', error);
            alert('Erreur lors de l\'export. Veuillez réessayer.');
        }
    }

    importRatings(file) {
        // Validate file type and size
        if (!file.type.includes('json')) {
            alert('Veuillez sélectionner un fichier JSON valide.');
            return;
        }

        if (file.size > 1024 * 1024) { // 1MB limit
            alert('Le fichier est trop volumineux (limite: 1MB).');
            return;
        }

        file.text()
            .then((text) => {
                try {
                    const importData = JSON.parse(text);
                    
                    // Validate the imported data
                    if (!this.validateRatingsData(importData)) {
                        throw new Error('Invalid data format or corrupted file');
                    }

                    // Confirm import with user
                    const metadata = importData.metadata;
                    const ratedMovies = Object.keys(importData.ratings).length;
                    const message = `Voulez-vous importer les notes ?\n\n` +
                        `Date d'export: ${new Date(metadata.exportDate).toLocaleDateString('fr-FR')}\n` +
                        `Films notés: ${ratedMovies}\n\n` +
                        `⚠️ Cela remplacera vos notes actuelles !`;

                    if (confirm(message)) {
                        // Save the imported ratings
                        localStorage.setItem(this.storageKey, JSON.stringify(importData.ratings));
                        
                        // Refresh the display
                        this.setupRatingCells();
                        this.updateMovieStats();
                        // Ensure DataTables re-reads updated DOM after import
                        try {
                            if (typeof table !== 'undefined' && table) {
                                table.rows().invalidate().draw(false);
                            }
                        } catch (e) {
                            // ignore
                        }
                        const ratedCount = this.getRatedMovieCount();
                        
                        alert(`Import réussi ! ${ratedCount} notes importées.`);
                    }

                } catch (error) {
                    console.error('Import failed:', error);
                    alert('Erreur lors de l\'import. Le fichier est peut-être corrompu ou invalide.');
                }
            })
            .catch(() => {
                alert('Erreur lors de la lecture du fichier.');
            });
    }
}

