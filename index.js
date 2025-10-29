// Initialize DataTable
const table =
    new DataTable('#liste', {
        paging: false,
        scrollCollapse: true,
        scrollY: '60vh',
        order: [[2, 'desc']],
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
            {
                targets: 2
            },
            {
                target: 7,
                visible: false
            },
            {
                target: 8,
                visible: false
            }
        ]
    });

// Toggle column visibility
$('a.toggle-vis').on('click', function (e) {
    e.preventDefault();
    var column = table.column($(this).attr('data-column'));
    column.visible(!column.visible());
    $(this).toggleClass('icon-visible icon-hidden');
});


// Dynamically replace cell content with a link
$('td[link]').each(function () {
    if (!$(this).is(':empty')) {
        var url = $(this).text();
        $(this).html('<a href="' + url + '" target="_blank">' + url + '</a>');
    }
});
$('td[justwatch]').each(function () {
    if (!$(this).is(':empty')) {
        var url = $(this).text();
        $(this).html('<a href="' + url + '" target="_blank">' + url + '</a>');
    }
});
$('td[replay]').each(function () {
    if (!$(this).is(':empty')) {
        var url = $(this).text();
        $(this).html('<a href="' + url + '" target="_blank">' + url + '</a>');
    }
});

// Poster columns are now in HTML, no need to add them dynamically

// Extract IMDb ID from IMDb links and populate poster cells
$('td[link]').each(function () {
    const imdbUrl = $(this).text();
    const imdbIdMatch = imdbUrl.match(/\/title\/(tt\d+)/);
    
    if (imdbIdMatch) {
        const imdbId = imdbIdMatch[1];
        const posterCell = $(this).closest('tr').find('td[poster]');
        
        if (posterCell.length) {
            posterCell.attr('data-imdb-id', imdbId);
        }
    }
});

// Handle poster thumbnails
$('td[poster]').each(function () {
    const imdbId = $(this).data('imdb-id');
    
    if (imdbId) {
        const posterPath = `media/${imdbId}/poster.jpg`;
        const $this = $(this);
        
        // Create thumbnail image
        const thumbnail = $('<img>')
            .attr('src', posterPath)
            .attr('alt', 'Poster')
            .addClass('poster-thumbnail')
            .css({
                'width': '50px',
                'cursor': 'pointer',
                'border-radius': '4px'
            })
            .on('error', function() {
                // If image doesn't exist, hide the thumbnail
                $(this).hide();
            })
            .on('click', function() {
                // Show modal with full size poster
                $('#modalPosterImg').attr('src', posterPath);
                const movieTitle = $(this).closest('tr').find('td[title]').text();
                $('#posterModalLabel').text('Poster - ' + movieTitle);
                $('#posterModal').modal('show');
            });
        
        $this.html(thumbnail);
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
        links.forEach(link => {
            const href = link.getAttribute('href');
            // Check if it's an image file and not poster.jpg
            if (href && href.match(/\.(jpg|jpeg|png|gif|webp)$/i) && href !== 'poster.jpg') {
                imageFiles.push(href);
            }
        });
        
        return imageFiles.sort(); // Sort alphabetically
    } catch (error) {
        console.log(`Could not list directory ${directoryPath}:`, error);
        return [];
    }
}

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
                    .css({
                        'width': '50px',
                        'height': '75px',
                        'object-fit': 'cover',
                        'cursor': 'pointer',
                        'border-radius': '4px',
                        'margin-right': '5px',
                        'margin-bottom': '2px'
                    })
                    .on('click', function() {
                        // Show modal with full size image
                        $('#modalPosterImg').attr('src', imagePath);
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

document.getElementById('updateDate').textContent = new Date(document.lastModified).toLocaleString('fr-FR');
