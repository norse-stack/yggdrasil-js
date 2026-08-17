# yggdrasil-js — the Yggdrasil frontend framework (TS).
#
# A pure-TS package: the framework builds with tsc into ts/core/dist, which is
# what consumers resolve (the package's exports all point at dist/). Downstream
# apps that link this package via a file: dep need `build` to have run first.

CORE := ts/core

.PHONY: help install build test

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Install the framework's devDeps
	cd $(CORE) && npm install

build: install ## Build the framework (tsc -> ts/core/dist)
	cd $(CORE) && npm run build

test: install ## Run the framework's unit tests (vitest)
	cd $(CORE) && npm test
