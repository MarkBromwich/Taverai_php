<div class="stack favorites-page">
    <div class="button-row">
        <a class="button button-soft" href="<?= e(route_url('menu')) ?>">Back to Menu</a>
    </div>

    <section class="screen-card stack">
        <div>
            <h2>Saved Meals</h2>
            <p class="inline-note">Meals are grouped by when you would most likely use them.</p>
        </div>
        <div class="stack" id="favorite-meals-groups">
            <p class="empty-state">Loading favorite meals...</p>
        </div>
    </section>

    <section class="stack" id="favorite-recipe-view"></section>
</div>
