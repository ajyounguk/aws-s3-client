// S3 Client UI helpers: confirm dialogs, JSON highlighting, copy button.
// Everything is built with textContent / DOM nodes - never innerHTML.
(function () {
    'use strict'

    // confirm destructive actions: data-confirm="Delete {bucketname}?" fills {field} from the form
    document.querySelectorAll('form[data-confirm]').forEach(function (form) {
        form.addEventListener('submit', function (e) {
            var msg = form.getAttribute('data-confirm').replace(/\{(\w+)\}/g, function (_, name) {
                var el = form.elements[name]
                return el ? el.value : ''
            })
            if (!window.confirm(msg)) e.preventDefault()
        })
    })

    // JSON syntax highlighting
    var TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],])/g

    function span(cls, text) {
        var s = document.createElement('span')
        s.className = cls
        s.textContent = text
        return s
    }

    function highlight(code) {
        var src = code.textContent
        var frag = document.createDocumentFragment()
        var last = 0
        var m
        TOKEN.lastIndex = 0
        while ((m = TOKEN.exec(src)) !== null) {
            if (m.index > last) frag.appendChild(document.createTextNode(src.slice(last, m.index)))
            if (m[1] !== undefined) {
                if (m[2] !== undefined) {
                    frag.appendChild(span('j-key', m[1]))
                    frag.appendChild(document.createTextNode(m[2]))
                } else {
                    frag.appendChild(span(/^"https?:\/\//.test(m[1]) ? 'j-str j-url' : 'j-str', m[1]))
                }
            } else if (m[3] !== undefined) {
                frag.appendChild(span(m[3] === 'null' ? 'j-null' : 'j-bool', m[3]))
            } else if (m[4] !== undefined) {
                frag.appendChild(span('j-num', m[4]))
            } else {
                frag.appendChild(span('j-punc', m[5]))
            }
            last = TOKEN.lastIndex
        }
        if (last < src.length) frag.appendChild(document.createTextNode(src.slice(last)))
        code.textContent = ''
        code.appendChild(frag)
    }

    document.querySelectorAll('pre.json > code').forEach(highlight)

    // copy button
    document.querySelectorAll('[data-copy-target]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var target = document.getElementById(btn.getAttribute('data-copy-target'))
            if (!target) return
            var done = function (label) {
                btn.textContent = label
                setTimeout(function () { btn.textContent = 'Copy' }, 1500)
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(target.textContent).then(function () { done('Copied') }, function () { done('Copy failed') })
            } else {
                done('Copy failed')
            }
        })
    })
})()
