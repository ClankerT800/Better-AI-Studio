(() => {     if (window.geminiWorkerRunning) return;
    window.geminiWorkerRunning = true;

    const SELECTORS = {
        modelTitle: 'ms-model-selector-v3 .title',
        tempSlider: 'div[data-test-id="temperatureSliderContainer"] mat-slider input[type="range"]',
        topPSlider: 'div[data-test-id="topPSliderContainer"] input[type="range"]',
        codeToggle: 'mat-slide-toggle.code-execution-toggle button',
        searchToggle: 'mat-slide-toggle.search-as-a-tool-toggle button',
        urlToggle: 'div[data-test-id="browseAsAToolTooltip"] button[role="switch"]',
        sysBtn: 'button[data-test-system-instructions-card]',
        sysClose: 'button[aria-label="Close panel"]',
        sysText: 'textarea[aria-label="System instructions"]',
        prompt: 'textarea[aria-label*="Type something"]',
        panel: '.ms-sliding-right-panel-dialog',
        chat: '.chat-view-container',
        turn: 'ms-turn',
        modalDialog: 'mat-mdc-dialog-container',
        modalRow: 'ms-model-carousel-row',
        modalContentBtn: 'ms-model-carousel-row .content-button',
        accountSwitcher: '.account-switcher-text',
        userName: '.name',
        accountDropdown: '[class*="account"], [class*="profile"], [class*="user"]',
        dropdownTrigger: 'button[aria-expanded], [role="button"]:has(.account-switcher-text), button[class*="account"], button[aria-label*="Account"], button[aria-label*="Profile"]'
    };

    const ACCOUNT_NAME_SELECTOR = '#account-switcher .name, [id*="account-switcher"] .name, .account-switcher .name';

    const SLIDER_QUERIES = {
        temperature: [
            'div[data-test-id="temperatureSliderContainer"] input[type="range"]',
            'input[type="range"][aria-label*="temperature" i]',
            'input[type="range"][aria-labelledby*="temperature" i]'
        ],
        topP: [
            'div[data-test-id="topPSliderContainer"] input[type="range"]',
            'input[type="range"][aria-label*="top p" i]',
            'input[type="range"][aria-labelledby*="top-p" i]',
            'input[type="range"][aria-labelledby*="topp" i]'
        ]
    };

    if (!window.$BAS) {
        window.$BAS = {
            cache: new Map(),
            rafs: new Set(),
            obs: new Set(),
            applying: false,
            preset: null,
            accountNameInFlight: false
        };
    }

    const $ = window.$BAS;

    const raf = (fn) => {
        const id = requestAnimationFrame(() => {
            $.rafs.delete(id);
            fn();
        });
        $.rafs.add(id);
        return id;
    };

    const getEl = (sel) => {
        if ($.cache.has(sel)) {
            const el = $.cache.get(sel);
            if (document.contains(el)) return el;
        }
        const el = document.querySelector(sel);
        if (el) $.cache.set(sel, el);
        return el;
    };

    const wait = (sel, cb, ms = 5000, onTimeout) => {
        const el = document.querySelector(sel);
        if (el) return cb(el);
        let timeoutId;
        const obs = new MutationObserver(() => {
            const e = document.querySelector(sel);
            if (e) {
                obs.disconnect();
                $.obs.delete(obs);
                clearTimeout(timeoutId);
                cb(e);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        $.obs.add(obs);
        timeoutId = setTimeout(() => {
            obs.disconnect();
            $.obs.delete(obs);
            onTimeout?.();
        }, ms);
    };

    const getSliderContextText = (input) => {
        if (!input) return '';
        const pieces = [];
        const ariaLabel = input.getAttribute('aria-label');
        if (ariaLabel) pieces.push(ariaLabel);
        const labelledBy = input.getAttribute('aria-labelledby');
        if (labelledBy) {
            labelledBy.split(/\s+/).forEach((id) => {
                const labelEl = document.getElementById(id);
                if (labelEl?.textContent) {
                    pieces.push(labelEl.textContent);
                }
            });
        }
        const container = input.closest('.settings-item, .settings-item-column, .settings-item-row, [data-test-id], label, mat-form-field, .mat-mdc-form-field, .slider-container');
        if (container?.textContent) {
            pieces.push(container.textContent);
        }
        return pieces.join(' ').toLowerCase();
    };

    const sliderTypeFromElement = (input) => {
        if (!input) return null;
        const container = input.closest('[data-test-id]');
        const testId = container?.dataset?.testId?.toLowerCase();
        if (testId) {
            if (testId.includes('temperature')) return 'temperature';
            if (testId.includes('toppslider') || testId.includes('toppslidercontainer') || testId.includes('top-p')) {
                return 'topP';
            }
        }
        const context = getSliderContextText(input);
        if (context.includes('temperature')) return 'temperature';
        if (context.includes('top p') || context.includes('top-p')) return 'topP';
        return null;
    };

    const findSliderByType = (type) => {
        const selectors = SLIDER_QUERIES[type] ?? [];
        for (const selector of selectors) {
            const input = document.querySelector(selector);
            if (input && sliderTypeFromElement(input) === type) {
                return input;
            }
        }
        const candidates = Array.from(
            document.querySelectorAll(
                'div[data-test-id] input[type="range"], input[type="range"][aria-label], input[type="range"][aria-labelledby]'
            )
        );
        return candidates.find((input) => sliderTypeFromElement(input) === type) ?? null;
    };

    const sectionController = (() => {
        const getToggle = (header) =>
            header?.matches('button, [role="button"]')
                ? header
                : header?.querySelector('button, [role="button"]');

        const getContent = (header) => {
            const group = header?.closest('.settings-group');
            return (
                group?.querySelector('.settings-group-content') ??
                header?.nextElementSibling ??
                group?.querySelector('.settings-group-content') ??
                null
            );
        };

        const isExpanded = (header) => {
            const toggle = getToggle(header);
            if (!toggle) return false;
            const attr = toggle.getAttribute('aria-expanded');
            if (attr === 'true') return true;
            if (attr === 'false') return false;
            const group = header?.closest('.settings-group');
            if (group?.classList.contains('expanded')) return true;
            const content = getContent(header);
            if (!content) return false;
            if (content.hidden) return false;
            const style = window.getComputedStyle(content);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.height !== '0px';
        };

        const expand = (header) => {
            const toggle = getToggle(header);
            if (!toggle || isExpanded(header)) return false;
            let toggled = false;
            const attempt = (tries = 0) => {
                if (isExpanded(header) || tries > 2) return;
                toggle.click();
                toggled = true;
                setTimeout(() => {
                    if (!isExpanded(header)) {
                        attempt(tries + 1);
                    }
                }, 140);
            };
            attempt(0);
            return toggled;
        };

        const collapse = (header) => {
            const toggle = getToggle(header);
            if (!toggle || !isExpanded(header)) return false;
            let toggled = false;
            const attempt = (tries = 0) => {
                if (!isExpanded(header) || tries > 2) return;
                toggle.click();
                toggled = true;
                setTimeout(() => {
                    if (isExpanded(header)) {
                        attempt(tries + 1);
                    }
                }, 140);
            };
            attempt(0);
            return toggled;
        };

        return { isExpanded, expand, collapse };
    })();

    const prepareSectionsForPreset = (preset) => {
        const headers = Array.from(document.querySelectorAll('.settings-group-header'));
        const matchHeader = (label) =>
            headers.find((h) => h.querySelector('.group-title')?.textContent?.toLowerCase().includes(label));
        const toolsHeader = matchHeader('tools');
        const advancedHeader = matchHeader('advanced');

        const headersToCollapse = new Set();
        const markForCollapse = (header) => {
            if (header) {
                headersToCollapse.add(header);
            }
        };
        const ensureOpen = (header) => {
            if (!header) return;
            if (!sectionController.isExpanded(header)) {
                sectionController.expand(header);
            }
            markForCollapse(header);
        };
        const ensureClosedAfter = (header) => {
            if (!header) return;
            markForCollapse(header);
        };

        const expectsTopP = typeof preset?.topP === 'number' && !Number.isNaN(preset.topP);
        const topPSlider = findSliderByType('topP');
        const topPContainerExists = Boolean(document.querySelector('div[data-test-id="topPSliderContainer"]'));

        const needsAdvancedOpen = (expectsTopP || topPContainerExists) && !topPSlider;
        if (needsAdvancedOpen) {
            ensureOpen(advancedHeader);
        } else {
            ensureClosedAfter(advancedHeader);
        }

        if (!sectionController.isExpanded(toolsHeader)) {
            ensureOpen(toolsHeader);
        } else {
            ensureClosedAfter(toolsHeader);
        }

        return Array.from(headersToCollapse).filter(Boolean);
    };

    const apply = (p) => {
        if (!p || $.applying) return;
        $.applying = true;
        $.cache.clear();

        const inPresetContext = window.location.href.includes('/prompts/');
        let needsRetry = false;
        let finished = false;
        let pendingTasks = 1;
        let retryDelay = 120;

        const requestRetry = (delay = 150) => {
            if (!inPresetContext) return;
            needsRetry = true;
            retryDelay = Math.max(retryDelay, delay);
        };

        const complete = () => {
            if (finished) return;
            finished = true;
            $.applying = false;
            if (needsRetry) {
                setTimeout(() => {
                    if (!$.applying) {
                        queueApply();
                    }
                }, retryDelay);
            }
        };

        const taskDone = () => {
            pendingTasks -= 1;
            if (pendingTasks <= 0) {
                complete();
            }
        };

        const addTask = () => {
            pendingTasks += 1;
        };

        addTask();
        setTimeout(() => {
            const sectionsToRestore = prepareSectionsForPreset(p);
            raf(() => {
                const temperatureSlider = findSliderByType('temperature');
                const topPSlider = findSliderByType('topP');
                const code = getEl(SELECTORS.codeToggle);
                const search = getEl(SELECTORS.searchToggle);
                const url = getEl(SELECTORS.urlToggle);

                if (!temperatureSlider) {
                    requestRetry(220);
                    wait(
                        'div[data-test-id="temperatureSliderContainer"] input[type="range"]',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                }

                if (!topPSlider) {
                    const topPContainerSelector = 'div[data-test-id="topPSliderContainer"]';
                    const topPContainer = document.querySelector(topPContainerSelector);
                    if (topPContainer) {
                        wait(
                            `${topPContainerSelector} input[type="range"]`,
                            () => {
                                if (!$.applying) {
                                    queueApply();
                                }
                            },
                            4000
                        );
                    } else {
                        wait(
                            topPContainerSelector,
                            () => {
                                if (!$.applying) {
                                    queueApply();
                                }
                            },
                            4000
                        );
                    }
                }

                const expectCodeToggle = Boolean(
                    document.querySelector('mat-slide-toggle.code-execution-toggle')
                );
                if (!code && expectCodeToggle) {
                    requestRetry(200);
                    wait(
                        'mat-slide-toggle.code-execution-toggle button',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                } else if (!code) {
                    wait(
                        'mat-slide-toggle.code-execution-toggle',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                }

                const expectSearchToggle = Boolean(
                    document.querySelector('mat-slide-toggle.search-as-a-tool-toggle')
                );
                if (!search && expectSearchToggle) {
                    requestRetry(200);
                    wait(
                        'mat-slide-toggle.search-as-a-tool-toggle button',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                } else if (!search) {
                    wait(
                        'mat-slide-toggle.search-as-a-tool-toggle',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                }

                const expectUrlToggle = Boolean(document.querySelector('div[data-test-id="browseAsAToolTooltip"]'));
                if (!url && expectUrlToggle) {
                    requestRetry(200);
                    wait(
                        SELECTORS.urlToggle,
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                } else if (!url) {
                    wait(
                        'div[data-test-id="browseAsAToolTooltip"]',
                        () => {
                            if (!$.applying) {
                                queueApply();
                            }
                        },
                        4000
                    );
                }

                if (temperatureSlider && Math.abs(parseFloat(temperatureSlider.value) - p.temperature) > 0.001) {
                    temperatureSlider.value = p.temperature;
                    temperatureSlider.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (topPSlider && Math.abs(parseFloat(topPSlider.value) - p.topP) > 0.001) {
                    topPSlider.value = p.topP;
                    topPSlider.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (code && (code.getAttribute('aria-checked') === 'true') !== p.tools.codeExecution) {
                    code.click();
                }
                if (search && (search.getAttribute('aria-checked') === 'true') !== p.tools.search) {
                    search.click();
                }
                if (url && (url.getAttribute('aria-checked') === 'true') !== (p.tools.urlContext || false)) {
                    url.click();
                }

                if (sectionsToRestore.length > 0) {
                    setTimeout(() => {
                        sectionsToRestore.forEach((header) => {
                            if (sectionController.isExpanded(header)) {
                                sectionController.collapse(header);
                            }
                        });
                    }, 140);
                }

                taskDone();
            });
        }, 80);

        const systemInstructions = (p.systemInstructions ?? '').trim();
        const sysBtn = getEl(SELECTORS.sysBtn);

        if (sysBtn && systemInstructions) {
            addTask();
            sysBtn.click();
            let sysTaskCompleted = false;
            const finishSystemTask = () => {
                if (sysTaskCompleted) return;
                sysTaskCompleted = true;
                taskDone();
            };
            wait(
                `${SELECTORS.panel} ${SELECTORS.sysText}`,
                (area) => {
                    if (sysTaskCompleted) return;
                    if (area.value !== systemInstructions) {
                        area.value = systemInstructions;
                        area.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    const close = area.closest(SELECTORS.panel)?.querySelector(SELECTORS.sysClose);
                    if (close) {
                        setTimeout(() => {
                            if (sysTaskCompleted) return;
                            close.click();
                            const observer = new MutationObserver(() => {
                                if (!document.querySelector(SELECTORS.panel)) {
                                    observer.disconnect();
                                    finishSystemTask();
                                }
                            });
                            observer.observe(document.body, { childList: true, subtree: true });
                            setTimeout(() => {
                                observer.disconnect();
                                finishSystemTask();
                            }, 800);
                        }, 40);
                    } else {
                        finishSystemTask();
                    }
                },
                2500,
                () => {
                    requestRetry(220);
                    finishSystemTask();
                }
            );
        } else {
            if (systemInstructions) {
                requestRetry(220);
            }
            if (!sysBtn && systemInstructions) {
                wait(
                    SELECTORS.sysBtn,
                    () => {
                        if (!$.applying) {
                            queueApply();
                        }
                    },
                    4000
                );
            }
        }

        taskDone();
    };

    const queueApply = () => {
        if ($.preset) {
            clearTimeout($.applyTimer);
            $.applyTimer = setTimeout(() => {
                if (!$.applying) {
                    raf(() => apply($.preset));
                }
            }, 100);
        }
    };

    const observeModal = () => {
        const obs = new MutationObserver(() => {
            const modal = getEl(SELECTORS.modalDialog);
            if (modal && !modal.dataset.bas) {
                modal.dataset.bas = '1';

                const rows = modal.querySelectorAll(SELECTORS.modalRow);
                rows.forEach(row => {
                    const rowObs = new MutationObserver(() => {
                        if (row.classList.contains('selected')) {
                            queueApply();
                        }
                    });
                    rowObs.observe(row, { attributes: true, attributeFilter: ['class'] });
                    $.obs.add(rowObs);
                });

                const btns = modal.querySelectorAll(SELECTORS.modalContentBtn);
                btns.forEach(btn => {
                    btn.addEventListener('click', () => {
                        setTimeout(queueApply, 100);
                    }, { once: true });
                });

                const close = modal.querySelector('[data-test-close-button]');
                if (close) {
                    close.addEventListener('click', () => {
                        setTimeout(queueApply, 100);
                    }, { once: true });
                }

                const removalObs = new MutationObserver((muts) => {
                    muts.forEach((mut) => {
                        mut.removedNodes.forEach((node) => {
                            if (node === modal || (node.contains && node.contains(modal))) {
                                removalObs.disconnect();
                                $.obs.delete(removalObs);
                                setTimeout(queueApply, 100);
                            }
                        });
                    });
                });
                removalObs.observe(document.body, { childList: true, subtree: true });
                $.obs.add(removalObs);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        $.obs.add(obs);
    };

    const observeModel = () => {
        wait(SELECTORS.modelTitle, (el) => {
            let last = '';
            const obs = new MutationObserver(() => {
                const m = el.textContent.trim().toLowerCase();
                if (m !== last) {
                    last = m;
                    queueApply();
                }
            });
            obs.observe(el, { characterData: true, childList: true, subtree: true });
            $.obs.add(obs);
        });
    };

    const observeUrl = () => {
        let lastUrl = location.href;
        let lastTitle = document.title;

        const urlObs = new MutationObserver(() => {
            if (location.href !== lastUrl || document.title !== lastTitle) {
                lastUrl = location.href;
                lastTitle = document.title;
                setTimeout(() => {
                    observeModel();
                    observeModal();
                    observeAccountSwitcher();
                     queueApply();
                }, 200);
            }
        });

        const titleElement = document.querySelector('title') || document.head;
        urlObs.observe(titleElement, { childList: true, subtree: true });
        $.obs.add(urlObs);

        const setupNavigation = () => {
            const handleNavigation = () => {
                setTimeout(() => {
                    observeModel();
                    observeModal();
                    observeAccountSwitcher();
                    queueApply();
                }, 200);
            };

            document.querySelectorAll('a').forEach(link => {
                if (!link.dataset.bas &&
                    (link.href.includes('/prompts/') ||
                     link.href.includes('/library') ||
                     link.href.includes('aistudio.google.com'))) {
                    link.dataset.bas = '1';
                    link.addEventListener('click', handleNavigation);
                }
            });

            document.querySelectorAll('button').forEach(btn => {
                if (!btn.dataset.bas &&
                    (btn.textContent.includes('Back') ||
                     btn.textContent.includes('Previous') ||
                     btn.getAttribute('aria-label')?.includes('back'))) {
                    btn.dataset.bas = '1';
                    btn.addEventListener('click', handleNavigation);
                }
            });
        };

        setupNavigation();
        setInterval(setupNavigation, 200);

        const origPush = history.pushState;
        const origReplace = history.replaceState;
        const origBack = history.back;
        const origForward = history.forward;
        const origGo = history.go;

        const handleNavigation = () => {
            setTimeout(() => {
                observeModel();
                observeModal();
                observeAccountSwitcher();
               queueApply();
            }, 200);
        };

        history.pushState = function() {
            origPush.apply(this, arguments);
            handleNavigation();
        };

        history.replaceState = function() {
            origReplace.apply(this, arguments);
            handleNavigation();
        };

        history.back = function() {
            origBack.apply(this, arguments);
            handleNavigation();
        };

        history.forward = function() {
            origForward.apply(this, arguments);
            handleNavigation();
        };

        history.go = function() {
            origGo.apply(this, arguments);
            handleNavigation();
        };

        window.addEventListener('popstate', handleNavigation);
        window.addEventListener('beforeunload', handleNavigation);
    };

    const recordOverlayState = (container) => ({
        container,
        style: container.getAttribute('style') ?? ''
    });

    const maskOverlayContainer = () => {
        const container = document.querySelector('.cdk-overlay-container');
        if (!container) return null;
        const snapshot = recordOverlayState(container);
        container.style.visibility = 'hidden';
        container.style.opacity = '0';
        container.style.pointerEvents = 'none';
        container.style.transform = 'translate3d(-9999px, -9999px, 0)';
        container.style.transition = 'none';
        return snapshot;
    };

    const restoreOverlayContainer = (snapshot) => {
        if (!snapshot) return;
        const { container, style } = snapshot;
        requestAnimationFrame(() => {
            if (!container) return;
            if (style) container.setAttribute('style', style);
            else container.removeAttribute('style');
        });
    };

    const removeOverlayNodes = (pane) => {
        if (!pane || !pane.isConnected) return;
        const boundingBox = pane.parentElement;
        const container = boundingBox?.parentElement;
        if (boundingBox?.classList?.contains('cdk-overlay-connected-position-bounding-box')) {
            boundingBox.remove();
        } else {
            pane.remove();
        }
        if (container?.classList?.contains('cdk-overlay-container')) {
            const orphanBackdrops = Array.from(container.querySelectorAll('.cdk-overlay-backdrop')).filter(
                (backdrop) => !backdrop.previousElementSibling
            );
            orphanBackdrops.forEach((backdrop) => backdrop.remove());
        }
    };

    const closeAccountOverlay = (trigger, overlayPane, done, allowForceClose = false) => {
        const pane = overlayPane?.closest?.('.cdk-overlay-pane') ?? overlayPane;
        const container = document.querySelector('.cdk-overlay-container');
        let completed = false;
        let observer;

        const finish = () => {
            if (completed) return;
            completed = true;
            observer?.disconnect();
            done?.();
        };

        if (!pane || !pane.isConnected) {
            finish();
            return;
        }

        observer = container
            ? new MutationObserver(() => {
                  if (!pane.isConnected) {
                      finish();
                  }
              })
            : null;

        observer?.observe(container, { childList: true });

        let attempt = 0;
        const maxAttempts = 6;
        const step = () => {
            if (!pane.isConnected) {
                finish();
                return;
            }

            const actions =
                attempt === 0
                    ? [
                          () => trigger.click(),
                          () =>
                              document.dispatchEvent(
                                  new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
                              ),
                          () => {
                              const closeBtn = pane.querySelector(
                                  'button[aria-label*="Close"], button[class*="close"]'
                              );
                              closeBtn?.click();
                          }
                      ]
                    : [
                          () =>
                              document.dispatchEvent(
                                  new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
                              )
                      ];

            actions.forEach((action) => {
                try {
                    action();
                } catch (e) {
                    // ignore and continue
                }
            });

            attempt += 1;
            requestAnimationFrame(() => {
                if (!pane.isConnected) {
                    finish();
                } else if (attempt < maxAttempts) {
                    step();
                } else {
                    if (allowForceClose) {
                        removeOverlayNodes(pane);
                    }
                    finish();
                }
            });
        };

        step();
    };

    const ensureAccountDisplayName = () => {
        const label = document.querySelector(SELECTORS.accountSwitcher);
        if (!label) return;

        const labelText = label.textContent?.trim() ?? '';
        if (!labelText.includes('@')) return;

        if ($.accountNameInFlight) return;

        const trigger =
            label.closest('button') ||
            label.closest('[role="button"]') ||
            document.querySelector(SELECTORS.dropdownTrigger);

        if (!trigger) return;

        $.accountNameInFlight = true;
        let finished = false;
        let nameObserver = null;
        let removalObserver = null;

        const existingOverlayRoot = document.querySelector('#account-switcher');
        const overlayAlreadyOpen = Boolean(existingOverlayRoot);
        const overlaySnapshot = overlayAlreadyOpen ? null : maskOverlayContainer();

        const cleanupObservers = () => {
            nameObserver?.disconnect();
            removalObserver?.disconnect();
            nameObserver = null;
            removalObserver = null;
        };

        const finalize = (overlayPane) => {
            if (finished) return;
            finished = true;
            cleanupObservers();
            const pane =
                overlayPane ||
                document.querySelector('#account-switcher')?.closest('.cdk-overlay-pane') ||
                document.querySelector(ACCOUNT_NAME_SELECTOR)?.closest('.cdk-overlay-pane') ||
                null;

            const onClosed = () => {
                restoreOverlayContainer(overlaySnapshot);
                $.accountNameInFlight = false;
            };

            if (!overlayAlreadyOpen) {
                closeAccountOverlay(trigger, pane, onClosed, true);
            } else {
                onClosed();
            }
        };

        const applyName = (nameEl) => {
            if (finished) return;
            if (nameEl) {
                const name = nameEl.textContent?.trim();
                if (name) {
                    label.textContent = name;
                }
            }
            const pane =
                nameEl?.closest?.('.cdk-overlay-pane') ||
                document.querySelector('#account-switcher')?.closest('.cdk-overlay-pane') ||
                null;
            finalize(pane);
        };

        const observeOverlay = (overlayRoot) => {
            if (finished) return;
            if (!overlayRoot) {
                finalize(null);
                return;
            }

            const pane = overlayRoot.closest('.cdk-overlay-pane');
            const findName = () => {
                if (finished) return;
                const candidate =
                    overlayRoot.querySelector('.name') ||
                    overlayRoot.querySelector('[class*="name"]') ||
                    document.querySelector(ACCOUNT_NAME_SELECTOR);
                if (candidate && candidate.textContent?.trim()) {
                    applyName(candidate);
                }
            };

            findName();
            if (finished) return;

            nameObserver = new MutationObserver(findName);
            nameObserver.observe(overlayRoot, {
                childList: true,
                subtree: true,
                characterData: true
            });

            if (pane) {
                removalObserver = new MutationObserver(() => {
                    if (!pane.isConnected) {
                        finalize(pane);
                    }
                });
                const target = pane.parentElement ?? document.body;
                removalObserver.observe(target, { childList: true, subtree: true });
            } else {
                removalObserver = new MutationObserver(() => {
                    if (!overlayRoot.isConnected) {
                        finalize(null);
                    }
                });
                removalObserver.observe(document.body, { childList: true, subtree: true });
            }
        };

        if (!overlayAlreadyOpen) {
            try {
                trigger.click();
            } catch (error) {
                restoreOverlayContainer(overlaySnapshot);
                $.accountNameInFlight = false;
                return;
            }
        }

        if (existingOverlayRoot) {
            observeOverlay(existingOverlayRoot);
            return;
        }

        const immediateOverlay = document.querySelector('#account-switcher');
        if (immediateOverlay) {
            observeOverlay(immediateOverlay);
            return;
        }

        wait(
            '#account-switcher',
            (overlayRoot) => observeOverlay(overlayRoot),
            4000,
            () => finalize(null)
        );
    };

    const observeAccountSwitcher = () => {
        const accountObs = new MutationObserver(() => {
            raf(ensureAccountDisplayName);
        });

        accountObs.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'id', 'data-testid', 'aria-label'],
            characterData: true
        });
        $.obs.add(accountObs);

        ensureAccountDisplayName();
    };

    class SmartThemeEngine {
        constructor() {
            this.styleEl = null;
            this.currentThemeId = null;
            this.config = null;
        }

        async init() {
            await this.loadConfig();
            await this.loadTheme();
        }

        async loadConfig() {
            try {
                const response = await fetch(chrome.runtime.getURL('themes/theme-config.json'));
                this.config = await response.json();
            } catch (e) {
                console.log('Config load failed');
                this.config = this.getDefaultConfig();
            }
        }

        getDefaultConfig() {
            return {
                version: "3.0.0",
                themes: {},
                css: {
                    baseVariables: "",
                    websiteOverrides: "",
                    selectors: {}
                }
            };
        }

        async loadTheme() {
            try {
                const data = await chrome.storage.sync.get('settings');
                const settings = data.settings || {};
                const themeId = settings.currentTheme || 'monochrome';

                const theme = this.config.themes[themeId] || this.config.themes.monochrome;
                await this.applyTheme(theme);
                this.currentThemeId = themeId;
            } catch (e) {
                console.log('Theme load error');
            }
        }

        async applyTheme(theme) {
            const css = await this.generateSmartCSS(theme);
            if (!this.styleEl) {
                this.styleEl = document.createElement('style');
                this.styleEl.id = 'better-aistudio-theme';
                document.head.appendChild(this.styleEl);
            }
            this.styleEl.textContent = css;
        }

        async generateSmartCSS(theme) {
            const { primary, background, surface, text } = theme.base;
            const radius = theme.radius || '8px';
            const borderWidth = theme.borderWidth || '1px';

            // Load CSS from theme-config.json
            const response = await fetch(chrome.runtime.getURL('themes/theme-config.json'));
            const config = await response.json();
            const cssConfig = config.css;

            // Replace placeholders in base variables
            let baseVariables = cssConfig.baseVariables
                .replace('${primary}', primary)
                .replace('${background}', background)
                .replace('${surface}', surface)
                .replace('${text}', text)
                .replace('${radius}', radius)
                .replace('${borderWidth}', borderWidth);

            // Combine all CSS selectors including the new accountSwitcher
            const allSelectors = Object.values(cssConfig.selectors).join('\n\n');
            const accountSwitcherCSS = cssConfig.selectors.accountSwitcher || '.account-switcher-text { color: var(--bas-text) !important; font-weight: 500 !important; transition: none !important; animation: none !important; opacity: 1 !important; transform: none !important; pointer-events: auto !important; }';

            return `${baseVariables}\n\n${cssConfig.websiteOverrides}\n\n${allSelectors}\n\n${accountSwitcherCSS}`;
        }
    }

    const init = () => {
        chrome.storage.local.get(['presets', 'activePresetIndex'], (r) => {
            const preset = r.presets?.[r.activePresetIndex] ?? null;
            $.preset = preset;
            if (preset) {
                queueApply();
            }
        });

        chrome.storage.onChanged.addListener((changes) => {
            if (changes.activePresetIndex || changes.presets) {
                chrome.storage.local.get(['presets', 'activePresetIndex'], (r) => {
                    const preset = r.presets?.[r.activePresetIndex] ?? null;
                    $.preset = preset;
                    if (preset) {
                        queueApply();
                    }
                });
            }
        });

        observeModel();
        observeModal();
        observeUrl();
        setTimeout(() => { if ($.preset) raf(() => apply($.preset)); }, 200);

        // INSTANT execution - start immediately with zero delays
        observeAccountSwitcher();
        ensureAccountDisplayName();
        requestAnimationFrame(ensureAccountDisplayName);
        requestAnimationFrame(() => requestAnimationFrame(ensureAccountDisplayName));

        const themeEngine = new SmartThemeEngine();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => themeEngine.init());
        } else {
            themeEngine.init();
        }

        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'THEME_CHANGED') {
                themeEngine.loadTheme();
                // Re-run account switcher observer to apply new theme styles
                observeAccountSwitcher();
            }
        });
    };

    window.addEventListener('beforeunload', () => {
        $.rafs.forEach(cancelAnimationFrame);
        $.rafs.clear();
        $.obs.forEach(o => o.disconnect());
        $.obs.clear();
        $.cache.clear();
    }, { once: true, passive: true });

    init();
})()
