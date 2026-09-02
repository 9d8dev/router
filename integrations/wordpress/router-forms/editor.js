(function (blocks, element, components, blockEditor, apiFetch) {
    'use strict';
    var el = element.createElement;
    var useEffect = element.useEffect;
    var useRef = element.useRef;
    var useState = element.useState;
    var InspectorControls = blockEditor.InspectorControls;
    var PanelBody = components.PanelBody;
    var SelectControl = components.SelectControl;
    var Notice = components.Notice;
    var Spinner = components.Spinner;

    function Edit(props) {
            var state = useState([]);
            var forms = state[0];
            var setForms = state[1];
            var loadingState = useState(true);
            var loading = loadingState[0];
            var setLoading = loadingState[1];
            var errorState = useState('');
            var error = errorState[0];
            var setError = errorState[1];
            var formId = props.attributes.formId || '';
            var previewRef = useRef(null);

            useEffect(function () {
                apiFetch({ path: '/router-forms/v1/forms' })
                    .then(function (response) {
                        setForms(response.forms || []);
                        setLoading(false);
                    })
                    .catch(function (requestError) {
                        setError(requestError.message || 'Could not load Router forms.');
                        setLoading(false);
                    });
            }, [setForms, setLoading, setError]);

            useEffect(function () {
                if (!formId) return;
                function mountPreview() {
                    if (previewRef.current && window.RouterFormsV1) {
                        window.RouterFormsV1.mount(previewRef.current);
                    }
                }
                var existing = document.querySelector('script[data-router-forms-editor]');
                if (existing) {
                    if (window.RouterFormsV1) mountPreview();
                    else existing.addEventListener('load', mountPreview);
                    return function () {
                        existing.removeEventListener('load', mountPreview);
                    };
                }
                var script = document.createElement('script');
                script.src = 'https://forms.router.so/embed/v1.js';
                script.async = true;
                script.dataset.routerFormsEditor = 'true';
                script.addEventListener('load', mountPreview);
                document.head.appendChild(script);
                return function () {
                    script.removeEventListener('load', mountPreview);
                };
            }, [formId, loading, error]);

            var options = [{ label: 'Choose a published form', value: '' }].concat(
                forms.map(function (form) {
                    return { label: form.name + ' — ' + form.title, value: form.publicId };
                })
            );

            var inspector = el(
                InspectorControls,
                null,
                el(
                    PanelBody,
                    { title: 'Router Form', initialOpen: true },
                    el(SelectControl, {
                        label: 'Published form',
                        value: formId,
                        options: options,
                        onChange: function (value) { props.setAttributes({ formId: value }); }
                    })
                )
            );

            var content;
            if (loading) content = el(Spinner);
            else if (error) content = el(Notice, { status: 'error', isDismissible: false }, error);
            else if (!formId) content = el(Notice, { status: 'info', isDismissible: false }, 'Choose a published Router form in block settings.');
            else content = el('div', { 'data-router-form': formId, 'data-router-placement': 'wordpress', key: formId, ref: previewRef });

            return el('div', blockEditor.useBlockProps(), inspector, content);
    }

    blocks.registerBlockType('router/forms', {
        edit: Edit,
        save: function () { return null; }
    });
})(window.wp.blocks, window.wp.element, window.wp.components, window.wp.blockEditor, window.wp.apiFetch);
