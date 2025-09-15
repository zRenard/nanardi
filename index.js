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
                targets: 2,
                render: DataTable.render.datetime('Do MMM YYYY')
            },
            {
                target: 5,
                visible: false
            },
            {
                target: 6,
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

document.getElementById('updateDate').textContent = new Date(document.lastModified).toLocaleString('fr-FR');
