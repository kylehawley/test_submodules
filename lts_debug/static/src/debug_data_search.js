/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { Dialog } from "@web/core/dialog/dialog";
import { Component, useState, onMounted, useRef, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { sortBy } from "@web/core/utils/arrays";

const debugRegistry = registry.category("debug");

/** Dialog that renders a raw record's fields with a live search bar. */
class FilteredRawRecordDialog extends Component {
  static template = xml`
        <Dialog title="props.title">
            <div class="o_debug_data_search">
                <input
                    type="text"
                    class="form-control mb-2"
                    placeholder="Filter fields by name..."
                    t-ref="search"
                    t-model="state.searchTerm"
                    autofocus="true"
                />
                <div class="o_debug_fields_list">
                    <t t-foreach="this.filteredFieldNames" t-as="fieldName" t-key="fieldName">
                        <div class="o_debug_field_row d-flex mb-1">
                            <span class="o_debug_field_name fw-bold text-nowrap me-2"
                                  t-esc="fieldName + ':'"/>
                            <span class="o_debug_field_value">
                                <t t-if="this.hasRelationalLinks(fieldName)">
                                    <t t-foreach="this.getRelationalLinks(fieldName)"
                                       t-as="link" t-key="fieldName + '_' + link.id">
                                        <a href="#"
                                           class="o_debug_record_link me-1"
                                           t-on-click.prevent="() => this.openRecord(link.model, link.id)"
                                           t-esc="link.label"/>
                                    </t>
                                </t>
                                <t t-else="">
                                    <t t-esc="this.formatValue(fieldName)"/>
                                </t>
                            </span>
                        </div>
                    </t>
                </div>
            </div>
        </Dialog>
    `;
  static components = { Dialog };
  static props = {
    record: { type: Object },
    fieldDefs: { type: Object },
    title: { type: String },
    close: { type: Function },
  };

  // Field types that carry a related model and should render as clickable links.
  static RELATIONAL_TYPES = new Set(["many2one", "one2many", "many2many"]);

  setup() {
    this.searchRef = useRef("search");
    this.actionService = useService("action");
    this.state = useState({ searchTerm: "" });
    onMounted(() => this.searchRef.el?.focus());
  }

  /** Sorted field names, optionally filtered by the current search term. */
  get filteredFieldNames() {
    const term = this.state.searchTerm.trim().toLowerCase();
    const names = Object.keys(this.props.record).filter(
      (name) => !term || name.toLowerCase().includes(term),
    );
    return sortBy(names, (n) => n);
  }

  /** Returns true when the field has a related model and should render links. */
  hasRelationalLinks(fieldName) {
    const def = this.props.fieldDefs[fieldName];
    return (
      !!def &&
      FilteredRawRecordDialog.RELATIONAL_TYPES.has(def.type) &&
      !!def.relation
    );
  }

  /**
   * Builds link descriptor objects for a relational field.
   *   - many2one:            value is [id, "display_name"]
   *   - one2many/many2many:  value is [id, id, ...]
   */
  getRelationalLinks(fieldName) {
    const value = this.props.record[fieldName];
    const def = this.props.fieldDefs[fieldName];
    const model = def.relation;

    if (!value) {
      return [];
    }

    if (def.type === "many2one") {
      if (Array.isArray(value) && value.length >= 2) {
        return [{ model, id: value[0], label: `${value[1]} (${value[0]})` }];
      }
      // Scalar fallback: server sent only the id without a display name.
      if (typeof value !== "object") {
        return [{ model, id: value, label: String(value) }];
      }
      return [];
    }

    // one2many / many2many
    if (Array.isArray(value)) {
      return value.map((id) => ({ model, id, label: String(id) }));
    }
    return [];
  }

  /** Formats a non-relational field value for display. */
  formatValue(fieldName) {
    const value = this.props.record[fieldName];
    if (value === null || value === undefined) {
      return value === null ? "null" : "undefined";
    }
    if (typeof value === "object") {
      // JSON fields and other complex types — pretty-print for readability.
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  /** Opens a related record in form view while preserving breadcrumbs. */
  openRecord(model, id) {
    this.actionService.doAction({
      type: "ir.actions.act_window",
      res_model: model,
      res_id: id,
      views: [[false, "form"]],
    });
  }
}

/**
 * Replacement for the built-in "Data" debug menu item.
 * Reads the current record and opens it in FilteredRawRecordDialog.
 */
function viewRawRecordWithSearch({ component, env }) {
  const { resId, resModel, fields } = component.model.config;
  if (!resId) {
    return null;
  }
  return {
    type: "item",
    description: _t("Data"),
    callback: async () => {
      // Exclude binary fields (not serialisable) and property fields.
      const readableFields = Object.entries(fields)
        .filter(([, v]) => v.type !== "binary" && !v.propertyName)
        .map(([k]) => k);

      const records = await component.model.orm.read(
        resModel,
        [resId],
        readableFields,
      );

      env.services.dialog.add(FilteredRawRecordDialog, {
        title: _t("Data: %(model)s(%(id)s)", { model: resModel, id: resId }),
        record: records[0],
        fieldDefs: fields,
      });
    },
    sequence: 120,
    section: "record",
  };
}

debugRegistry
  .category("form")
  .add("viewRawRecord", viewRawRecordWithSearch, { force: true });



// Test send a commit to main and see it on staging.