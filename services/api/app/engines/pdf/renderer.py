from pathlib import Path

import pymupdf


def render_page(
    path: Path,
    page_number: int,
    width_px: int,
    as_displayed: bool = False,
) -> dict:
    """Render one page as JPEG for on-screen previews.

    By default the page is shown unrotated so preview pixels map directly onto
    the unrotated coordinate space used by the overlay operations. With
    `as_displayed` it keeps its rotation, as a viewer would show it.
    """
    with pymupdf.open(path) as document:
        if document.needs_pass:
            raise ValueError("PDF is encrypted. Supply its password first.")

        if not 1 <= page_number <= document.page_count:
            raise ValueError(f"Page must be between 1 and {document.page_count}.")

        page = document[page_number - 1]
        if not as_displayed:
            page.set_rotation(0)

        zoom = width_px / page.rect.width
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)

        return {
            "image": pixmap.tobytes("jpeg", jpg_quality=82),
            "width": page.rect.width,
            "height": page.rect.height,
        }
