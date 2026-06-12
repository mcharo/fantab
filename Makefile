# fantab — common developer tasks. Run `make help` to list them.

.DEFAULT_GOAL := help
.PHONY: help install typecheck test check build icons package clean bump release

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	npm install

typecheck: ## Type-check the project
	npm run typecheck

test: ## Run the test suite
	npm test

check: typecheck test ## Type-check and run tests

build: ## Production build into dist/
	npm run build

icons: ## Re-export the PNG icons from the SVG
	npm run icons

package: build ## Build and zip dist/ into fantab-<version>.zip (store upload artifact)
	@VERSION=$$(node -p "require('./package.json').version"); \
		rm -f "fantab-$$VERSION.zip"; \
		cd dist && zip -qr -X "../fantab-$$VERSION.zip" .; \
		echo "Packaged fantab-$$VERSION.zip"

clean: ## Remove build output and packaged zips
	rm -rf dist fantab-*.zip

bump: ## Bump version in package.json + manifest: make bump VERSION=x.y.z
	@test -n "$(VERSION)" || { echo "Usage: make bump VERSION=x.y.z"; exit 1; }
	node scripts/bump-version.mjs $(VERSION)

release: ## Bump version, then type-check, test, and package: make release VERSION=x.y.z
	@test -n "$(VERSION)" || { echo "Usage: make release VERSION=x.y.z"; exit 1; }
	@$(MAKE) bump VERSION=$(VERSION)
	@$(MAKE) check
	@$(MAKE) package
	@echo "Release $(VERSION) packaged. Commit, tag v$(VERSION), and push to publish."
